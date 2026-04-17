import { Request, Response } from "express";
import SummerCamp from "./model";
import { summerCampSchema } from "./summercamp.sanitize";
import { AuthRequest } from "../auth";
import Permission from "../permissions/model";
import axios from "axios";


export const sendCampSMS = async (
  mobile: string,
  name: string,
  regId: string
) => {
  try {
    // Clean mobile
    const formattedMobile = mobile.startsWith("91")
      ? mobile
      : "91" + mobile.replace(/\D/g, "");

    // Your approved template message
    const message = `Hello ${name}, Your Sona Summer Camp Register ID is: ${regId}. Please bring this ID with you when coming to the camp. It is required for entry.`;

    const url = "http://promo.smso2.com/api/sendhttp.php";

    const response = await axios.get(url, {
      params: {
        authkey: "35386c6c65676537353621",
        mobiles: formattedMobile,
        message: message,
        sender: "SONACT",
        route: "2",
        country: "91",
        DLT_TE_ID: "1107177634604023642", 
      },
    });

    console.log("SMS Sent:", response.data);
  } catch (error: any) {
    console.error("SMS Error:", error.response?.data || error.message);
  }
};
/* =========================
   CREATE REGISTRATION
========================= */
export const createSummerCamp = async (req: Request, res: Response) => {
  try {
    const { error, value } = summerCampSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.details.map((e) => e.message),
      });
    }

    // Optional: prevent duplicate regno
    // if (value.regno && value.regno.trim() !== "") {
    //   const existing = await SummerCamp.findOne({ regno: value.regno });

    //   if (existing) {
    //     return res.status(400).json({
    //       status: "error",
    //       message: "Registration number already exists",
    //     });
    //   }
    // }

    // const existingMobile = await SummerCamp.findOne({
    //   mobile_no: value.mobile_no,
    // });

    // if (existingMobile) {
    //   return res.status(400).json({
    //     status: "error",
    //     message: "Mobile number already registered",
    //   });
    // }

    const camp = await SummerCamp.create(value);

    sendCampSMS(camp.mobile_no, camp.name, camp.regId);

    res.status(201).json({
      status: "success",
      message: "Registration is successful",
      regId: camp.regId,
    });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   LIST (PAGINATION + FILTER)
========================= */
// In your summercamp API route file
export const listSummerCamps = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search, // Single search parameter
      sport,
      startDate,
      endDate,
      paymentStatus,
      registrar
    } = req.query;

    const user = req.user;

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized - user not found",
      });
    }

    if (user.role !== "superadmin") {

      const permissionDoc = await Permission.findOne({
        instituteId: user.instituteId,
        userId: user.id,
      });

      const summerCampPermission = permissionDoc?.permissions.find(
        (p: any) => p.moduleName === "Summer Camp"
      );

      if (!summerCampPermission?.view) {
        return res.status(403).json({
          message: "You have no permission to view this data",
        });
      }
    }


    let filter: any = {};

    // Unified search across name, regno, mobile_no, regId
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { regno: { $regex: search, $options: "i" } },
        { mobile_no: { $regex: search, $options: "i" } },
        { regId: { $regex: search, $options: "i" } },
      ];
    }

    // Multi-sport filter - support comma-separated values
    if (sport) {
      const sportValues = (sport as string).split(',');
      if (sportValues.length === 1) {
        filter["sportsData.sport_name"] = sportValues[0];
      } else {
        filter["sportsData.sport_name"] = { $in: sportValues };
      }
    }

    // Payment status filter
    if (paymentStatus && paymentStatus !== 'all') {
      filter.paymentStatus = paymentStatus;
    }
    // Registrar filter
    if (registrar && registrar !== 'all') {
      filter.registrar = registrar;
    }
    // Date filter
    if (startDate || endDate) {
      const dateFilter: any = {};

      if (startDate) {
        const start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0);
        dateFilter.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }

      filter.createdAt = dateFilter;
    }

    // Get paginated results
    const result = await (SummerCamp as any).paginate(filter, {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 },
    });

    // Calculate statistics based on the SAME filter
    const stats = await SummerCamp.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRegistrations: { $sum: 1 },
          totalPaid: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] }
          },
          totalUnpaid: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "unpaid"] }, 1, 0] }
          },
          totalRevenue: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$totalAmt", 0] }
          }
        }
      }
    ]);

    const statistics = stats[0] || {
      totalRegistrations: 0,
      totalPaid: 0,
      totalUnpaid: 0,
      totalRevenue: 0
    };

    res.json({
      ...result,
      statistics
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
export const exportSummerCamps = async (req: AuthRequest, res: Response) => {
  try {
    const {
      search,
      sport,
      startDate,
      endDate,
      paymentStatus,
      registrar
    } = req.query;

    const user = req.user;

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized - user not found",
      });
    }

    if (user.role !== "superadmin") {

      const permissionDoc = await Permission.findOne({
        instituteId: user.instituteId,
        userId: user.id,
      });

      const summerCampPermission = permissionDoc?.permissions.find(
        (p: any) => p.moduleName === "Summer Camp"
      );

      if (!summerCampPermission?.filter) {
        return res.status(403).json({
          message: "You have no permission to export this data",
        });
      }
    }

    let filter: any = {};

    // 🔍 Search
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { regno: { $regex: search, $options: "i" } },
        { mobile_no: { $regex: search, $options: "i" } },
        { regId: { $regex: search, $options: "i" } },
      ];
    }

    // 🏀 Sport filter
    if (sport) {
      const sportValues = (sport as string).split(",");
      filter["sportsData.sport_name"] =
        sportValues.length === 1
          ? sportValues[0]
          : { $in: sportValues };
    }

    // 💰 Payment
    if (paymentStatus && paymentStatus !== "all") {
      filter.paymentStatus = paymentStatus;
    }

    // 👤 Registrar
    if (registrar && registrar !== "all") {
      filter.registrar = registrar;
    }

    // 📅 Date
    if (startDate || endDate) {
      const dateFilter: any = {};

      if (startDate) {
        const start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0);
        dateFilter.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }

      filter.createdAt = dateFilter;
    }

    // 🚀 NO PAGINATION (full data)
    const data = await SummerCamp.find(filter).sort({ createdAt: -1 });

    res.json({
      total: data.length,
      data
    });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
/* =========================
   GET SINGLE
========================= */
export const getSummerCamp = async (req: Request, res: Response) => {
  try {
    const camp = await SummerCamp.findById(req.params.id);

    if (!camp) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json(camp);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   UPDATE
========================= */
export const updateSummerCamp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { error, value } = summerCampSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.details.map((e) => e.message),
      });
    }

    const updated = await SummerCamp.findByIdAndUpdate(
      id,
      { $set: value },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json({
      message: "Updated successfully",
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updatePaymentStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    // validation
    if (!["paid", "unpaid"].includes(paymentStatus)) {
      return res.status(400).json({
        message: "Invalid payment status",
      });
    }

    const updated = await SummerCamp.findByIdAndUpdate(
      id,
      { $set: { paymentStatus } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json({
      message: "Payment status updated successfully",
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   DELETE
========================= */
export const deleteSummerCamp = async (req: Request, res: Response) => {
  try {
    const deleted = await SummerCamp.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json({ message: "Deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
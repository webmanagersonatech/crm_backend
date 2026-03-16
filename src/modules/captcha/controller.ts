import { Request, Response } from "express";
import svgCaptcha from "svg-captcha";

// Generate Captcha
export const generateCaptcha = (req: Request, res: Response) => {
  try {
    const captcha = svgCaptcha.create({
      size: 6,
      noise: 4,
      color: true,
      background: "#f2f2f2",
      charPreset: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    });

    // Store captcha text in session
    req.session.captcha = captcha.text;
    
    // Set session expiry (optional)
    req.session.cookie.maxAge = 1000 * 60 * 5; // 5 minutes

    res.status(200).json({
      success: true,
      captcha: captcha.data
    });

  } catch (error) {
    console.error("Captcha generation error:", error);
    res.status(500).json({
      success: false,
      message: "Captcha generation failed"
    });
  }
};

// Refresh Captcha
export const refreshCaptcha = (req: Request, res: Response) => {
  try {
    const captcha = svgCaptcha.create({
      size: 6,
      noise: 4,
      color: true,
      background: "#f2f2f2",
      charPreset: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    });

    req.session.captcha = captcha.text;
    req.session.cookie.maxAge = 1000 * 60 * 5; // 5 minutes

    res.status(200).json({
      success: true,
      captcha: captcha.data
    });

  } catch (error) {
    console.error("Captcha refresh error:", error);
    res.status(500).json({
      success: false,
      message: "Captcha refresh failed"
    });
  }
};

// Verify Captcha
export const verifyCaptcha = (req: Request, res: Response) => {
  try {
    const { captchaInput } = req.body;

    if (!captchaInput) {
      return res.status(400).json({
        success: false,
        message: "Captcha is required"
      });
    }

    if (!req.session.captcha) {
      return res.status(400).json({
        success: false,
        message: "Captcha expired. Please refresh."
      });
    }

    const isValid =
      captchaInput.toLowerCase() === req.session.captcha.toLowerCase();

    if (!isValid) {
      // Clear invalid captcha
      req.session.captcha = null;
      return res.status(400).json({
        success: false,
        message: "Invalid captcha"
      });
    }

    // Clear captcha after success (optional - depends on your use case)
    req.session.captcha = null;

    res.status(200).json({
      success: true,
      message: "Captcha verified"
    });

  } catch (error) {
    console.error("Captcha verification error:", error);
    res.status(500).json({
      success: false,
      message: "Captcha verification failed"
    });
  }
};
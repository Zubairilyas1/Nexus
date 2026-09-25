from typing import Optional
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import aiosmtplib
from app.config import get_settings

settings = get_settings()

SMTP_HOST = getattr(settings, 'SMTP_HOST', 'localhost')
SMTP_PORT = getattr(settings, 'SMTP_PORT', 587)
SMTP_USER = getattr(settings, 'SMTP_USER', '')
SMTP_PASS = getattr(settings, 'SMTP_PASS', '')
SMTP_FROM = getattr(settings, 'SMTP_FROM', 'NexusVision <noreply@nexusvision.local>')
APP_URL = getattr(settings, 'NEXT_PUBLIC_APP_URL', 'http://localhost:3001')


async def send_email(to: str, subject: str, html_content: str, text_content: Optional[str] = None) -> bool:
    """Send an email via SMTP."""
    if not SMTP_HOST or SMTP_HOST == 'localhost':
        print(f"[EMAIL DEV MODE] Would send to {to}: {subject}")
        print(f"HTML: {html_content[:200]}...")
        return True

    msg = MIMEMultipart('alternative')
    msg['From'] = SMTP_FROM
    msg['To'] = to
    msg['Subject'] = subject

    if text_content:
        msg.attach(MIMEText(text_content, 'plain'))
    msg.attach(MIMEText(html_content, 'html'))

    try:
        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            start_tls=True,
            username=SMTP_USER,
            password=SMTP_PASS,
        )
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False


def get_verification_email_template(verification_url: str, user_name: Optional[str] = None) -> tuple[str, str]:
    """Generate email verification email template."""
    name = user_name or "User"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); padding: 32px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">NexusVision</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 16px;">AI-Powered Traffic Analytics</p>
        </div>
        
        <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #111827; margin: 0 0 16px; font-size: 24px;">Welcome to NexusVision, {name}!</h2>
            
            <p style="color: #4b5563; margin: 0 0 24px; font-size: 16px;">
                Thanks for signing up! Please verify your email address to activate your account and start monitoring traffic analytics.
            </p>
            
            <div style="text-align: center; margin: 32px 0;">
                <a href="{verification_url}" style="display: inline-block; background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(6, 182, 212, 0.4);">
                    Verify Email Address
                </a>
            </div>
            
            <p style="color: #9ca3af; font-size: 14px; margin: 24px 0 0; text-align: center;">
                Or copy this link: <br>
                <a href="{verification_url}" style="color: #06b6d4; word-break: break-all;">{verification_url}</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
            
            <p style="color: #9ca3af; font-size: 13px; margin: 0; text-align: center;">
                This link expires in 24 hours. If you didn't create an account, please ignore this email.
            </p>
        </div>
        
        <div style="text-align: center; padding: 16px; color: #9ca3af; font-size: 12px;">
            &copy; 2024 NexusVision. All rights reserved.
        </div>
    </body>
    </html>
    """
    
    text = f"""
    Welcome to NexusVision, {name}!
    
    Thanks for signing up! Please verify your email address to activate your account.
    
    Verify your email: {verification_url}
    
    This link expires in 24 hours. If you didn't create an account, please ignore this email.
    
    -- 
    NexusVision Team
    """
    
    return html, text


def get_password_reset_email_template(reset_url: str, user_name: Optional[str] = None) -> tuple[str, str]:
    """Generate password reset email template."""
    name = user_name or "User"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 32px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">NexusVision</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 16px;">Password Reset Request</p>
        </div>
        
        <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #111827; margin: 0 0 16px; font-size: 24px;">Reset Your Password, {name}</h2>
            
            <p style="color: #4b5563; margin: 0 0 24px; font-size: 16px;">
                We received a request to reset your password. Click the button below to create a new password.
            </p>
            
            <div style="text-align: center; margin: 32px 0;">
                <a href="{reset_url}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4);">
                    Reset Password
                </a>
            </div>
            
            <p style="color: #9ca3af; font-size: 14px; margin: 24px 0 0; text-align: center;">
                Or copy this link: <br>
                <a href="{reset_url}" style="color: #f59e0b; word-break: break-all;">{reset_url}</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
            
            <p style="color: #9ca3af; font-size: 13px; margin: 0; text-align: center;">
                This link expires in 1 hour. If you didn't request a password reset, please ignore this email or contact support.
            </p>
        </div>
        
        <div style="text-align: center; padding: 16px; color: #9ca3af; font-size: 12px;">
            &copy; 2024 NexusVision. All rights reserved.
        </div>
    </body>
    </html>
    """
    
    text = f"""
    Password Reset Request for {name}
    
    We received a request to reset your password. Click the link below to create a new password.
    
    Reset your password: {reset_url}
    
    This link expires in 1 hour. If you didn't request a password reset, please ignore this email.
    
    --
    NexusVision Team
    """
    
    return html, text


def get_invite_email_template(invite_url: str, org_name: str, inviter_name: str, role: str) -> tuple[str, str]:
    """Generate organization invite email template."""
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 32px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">NexusVision</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 16px;">You've been invited to join an organization</p>
        </div>
        
        <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #111827; margin: 0 0 16px; font-size: 24px;">You're invited to {org_name}</h2>
            
            <p style="color: #4b5563; margin: 0 0 16px; font-size: 16px;">
                <strong>{inviter_name}</strong> has invited you to join <strong>{org_name}</strong> as a <strong>{role}</strong>.
            </p>
            
            <div style="text-align: center; margin: 32px 0;">
                <a href="{invite_url}" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(139, 92, 246, 0.4);">
                    Accept Invitation
                </a>
            </div>
            
            <p style="color: #9ca3af; font-size: 14px; margin: 24px 0 0; text-align: center;">
                Or copy this link: <br>
                <a href="{invite_url}" style="color: #8b5cf6; word-break: break-all;">{invite_url}</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
            
            <p style="color: #9ca3af; font-size: 13px; margin: 0; text-align: center;">
                This invitation expires in 7 days. If you weren't expecting this, please ignore.
            </p>
        </div>
    </body>
    </html>
    """
    
    text = f"""
    You're invited to {org_name}
    
    {inviter_name} has invited you to join {org_name} as a {role}.
    
    Accept invitation: {invite_url}
    
    This invitation expires in 7 days.
    
    --
    NexusVision Team
    """
    
    return html, text
import os
import smtplib
import ssl
import mysql.connector
import sys
import json
import sys
import argparse
import traceback
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from datetime import datetime

# ============================================================================
# INITIALIZATION - Logging start of script and loading configuration
# ============================================================================
print("=" * 80)
print("[INIT] pos-emailer.py starting...")
print(f"[INIT] Current environment variables: job={os.getenv('job', 'none')}")
print("=" * 80)

# smtp config (use same env names / pattern as `ugrad-emailer`)
smtp_server = "smtp.cs.vt.edu"
smtp_port = 465
context = ssl.create_default_context()
print(f"[INIT] SMTP configured: {smtp_server}:{smtp_port}")

# Prefer MAIL_USER / MAIL_PASSWORD for credentials (matches node/emailer and .env)
mail_user = os.environ.get("MAIL_USER", "peongrad")
mail_password = os.environ.get("MAIL_PASSWORD", "Hokies10!")
print(f"[INIT] Mail user configured: {mail_user}")
if not mail_password:
    print("     [WARNING] MAIL_PASSWORD not set in environment; SMTP authentication will fail until configured.")
else:
    print("[INIT] MAIL_PASSWORD loaded from environment")

DB_HOST = os.environ.get("dbhost", "saacs-database")
DB_USER = os.environ.get("dbuser", "user-saacsdb")
DB_PASS = os.environ.get("dbpass", "password25tts")
DB_NAME = os.environ.get("dbname", "saacs-db")
SITE_URL = os.environ.get("SITE_URL", "https://saacs.discovery.cs.vt.edu")
print(f"[INIT] Database configured: host={DB_HOST}, user={DB_USER}, db={DB_NAME}")
print(f"[INIT] Site URL: {SITE_URL}")

def get_db_conn():
    """Establish database connection - logs attempt and errors"""
    try:
        print(f"[DB] Attempting connection to {DB_HOST}...")
        conn = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASS,
            database=DB_NAME
        )
        print(f"[DB] Successfully connected to database {DB_NAME}")
        return conn
    except Exception as e:
        print(f"[DB ERROR] Failed to connect to database: {e}")
        print(f"[DB ERROR] Traceback: {traceback.format_exc()}")
        raise

def readable_timestamp(t):
    if not t:
        return "Unknown date"
    
    if isinstance(t, str):
        t = datetime.fromisoformat(t.replace('Z', '+00:00'))
    elif not isinstance(t, datetime):
        t = datetime.fromtimestamp(t)
    
    return t.strftime("%I:%M %p %b %d %Y")

def get_user_email(pid):
    """Retrieve email for a given PID from Faculty table, fallback to pid@vt.edu"""
    try:
        print(f"[USER_EMAIL] Looking up email for PID: {pid}")
        conn = get_db_conn()
        cursor = conn.cursor(dictionary=True)
        # Check if pid is in Faculty table
        cursor.execute("SELECT email FROM Faculty WHERE pid = %s", (pid,))
        result = cursor.fetchone()
        cursor.close()
        conn.close()
        if result and result.get("email"):
            print(f"[USER_EMAIL] Found email in Faculty table: {result['email']}")
            return result["email"]
        fallback_email = f"{pid}@vt.edu"
        print(f"[USER_EMAIL] No Faculty record found, using fallback: {fallback_email}")
        return fallback_email
    except Exception as e:
        print(f"[USER_EMAIL ERROR] Failed to retrieve email for {pid}: {e}")
        print(f"[USER_EMAIL ERROR] Traceback: {traceback.format_exc()}")
        return f"{pid}@vt.edu"

# sends email function general
def send_email(to_email, subject, html_body, text_body=None):
    """Generic email sending function - logs all steps for debugging"""
    sender_address = "gradinfo@cs.vt.edu"
    try:
        print(f"[EMAIL_SEND] Creating message for {to_email}")
        print(f"[EMAIL_SEND] Subject: {subject}")
        message = MIMEMultipart("alternative")
        message["From"] = formataddr(("SAACS Plan of Study", sender_address))
        message["To"] = to_email
        message["Subject"] = subject
        
        if text_body:
            print(f"[EMAIL_SEND] Adding plain text body ({len(text_body)} chars)")
            message.attach(MIMEText(text_body, "plain"))
        else:
            print(f"[EMAIL_SEND] No plain text body provided")
        
        print(f"[EMAIL_SEND] Adding HTML body ({len(html_body)} chars)")
        message.attach(MIMEText(html_body, "html"))
        
        # Send email using MAIL_USER / MAIL_PASSWORD (with sender_* fallback)
        if not mail_password:
            print(f"[ERROR] MAIL_PASSWORD not set; aborting send to {to_email}")
            return False
        
        print(f"[EMAIL_SEND] Connecting to SMTP server {smtp_server}:{smtp_port}")
        with smtplib.SMTP_SSL(smtp_server, smtp_port, context=context) as server:
            try:
                print(f"[EMAIL_SEND] Authenticating as {mail_user}")
                server.login(mail_user, mail_password)
                print(f"[EMAIL_SEND] Authentication successful")
            except Exception as e:
                print(f"[ERROR] Failed to log into SMTP server: {e}")
                print(f"[ERROR] Traceback: {traceback.format_exc()}")
                return False
            
            print(f"[EMAIL_SEND] Sending email from {sender_address} to {to_email}")
            server.sendmail(sender_address, to_email, message.as_string())
        
        print(f"[EMAIL_SUCCESS] Sent to {to_email}: {subject}")
        return True
        
    except Exception as e:
        print(f"[ERROR] Failed to send email to {to_email}: {str(e)}")
        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        return False

# POS Status constants (same as Node.js)
POS_STATUS = {
    "SAVED": 1,
    "PENDING_GRADUATE_COORDINATOR": 2,
    "PENDING_FACULTY": 3,
    "AWAITING_KEY": 4,
    "PENDING_GRADUATE_SCHOOL": 5,
    "APPROVED": 6,
    "REJECTED": 99,
}

# Status name map
STATUS_MAP = {
    1: "Saved",
    2: "Pending Graduate Coordinator",
    3: "Pending Faculty",
    4: "Awaiting Key",
    5: "Pending Graduate School",
    6: "Approved",
    99: "Rejected"
}

def build_pos_list_html(pos_entries):
    """
    Build an HTML table of POS entries for faculty notification.
    """
    html = """
    <table style="border-collapse: collapse; width: 100%; margin-top: 20px;">
        <thead>
            <tr style="background-color: #4a90e2; color: white;">
                <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">POS ID</th>
                <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Student PID</th>
                <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">POS Type</th>
                <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Committee Chair</th>
                <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Status</th>
            </tr>
        </thead>
        <tbody>
    """
    
    for entry in pos_entries:
        status_name = STATUS_MAP.get(entry['current_status'], f"Status {entry['current_status']}")
        html += f"""
            <tr style="background-color: #f9f9f9;">
                <td style="border: 1px solid #ddd; padding: 12px;">{entry['pos_id']}</td>
                <td style="border: 1px solid #ddd; padding: 12px;">{entry['pid']}</td>
                <td style="border: 1px solid #ddd; padding: 12px;">{entry['pos_type']}</td>
                <td style="border: 1px solid #ddd; padding: 12px;">{entry['committee_chair']}</td>
                <td style="border: 1px solid #ddd; padding: 12px;">{status_name}</td>
            </tr>
        """
    
    html += """
        </tbody>
    </table>
    """
    return html

def student_approved_email(student_pid):
    to_email = f"{student_pid}@vt.edu"
    subject = f"Plan of Study Approved"
    print(f"[STUDENT_APPROVED] Preparing approval email for PID {student_pid}")
    print(f"[STUDENT_APPROVED] Target email: {to_email}")
    text_body = f"""
    Your Plan of Study has been approved.
    Congratulations! Your Plan of Study has been successfully approved by the graduate school.

    For more information, visit: {SITE_URL}

    Best regards,
    SAACS Plan of Study
    """
    html_body = f"""
    <html>
        <body>
            <h2>Plan of Study Approved</h2>
            <p>Your Plan of Study has been approved.</p>
            <p><strong>Congratulations!</strong> Your Plan of Study has been successfully approved by the graduate school.</p>
            
            <p>For more information, visit: <a href="{SITE_URL}">{SITE_URL}</a></p>
            
            <p>Best regards,<br>
            SAACS Plan of Study System<br></p>
        </body>
    </html>
    """
    return send_email(to_email, subject, html_body, text_body)

def student_rejected_email(student_pid):
    to_email = f"{student_pid}@vt.edu"
    subject = f"Plan of Study Rejected"
    print(f"[STUDENT_REJECTED] Preparing rejection email for PID {student_pid}")
    print(f"[STUDENT_REJECTED] Target email: {to_email}")
    text_body = f"""
    Your Plan of Study has been rejected.
    
    For more information, visit: {SITE_URL}

    Best regards,
    SAACS Plan of Study
    """
    html_body = f"""
    <html>
        <body>
            <h2>Plan of Study Rejected</h2>
            <p>Your Plan of Study has been rejected.</p>
            
            <p>For more information, visit: <a href="{SITE_URL}">{SITE_URL}</a></p>
            
            <p>Best regards,<br>
            SAACS Plan of Study System<br></p>
        </body>
    </html>
    """
    return send_email(to_email, subject, html_body, text_body)

def faculty_notification_email(faculty_pid, pos_entries, status):
    status_name = STATUS_MAP.get(status, f"Status {status}")
    subject = f"Plan(s) of Study Awaiting Your Review"
    pos_list_html = build_pos_list_html(pos_entries)
    
    text_body = f"""
    You have Plan(s) of Study awaiting your review.

    Status: {status_name}
    Number of POS entries: {len(pos_entries)}

    Please log into the SAACS Plan of Study system to review these submissions.

    For more information, visit: {SITE_URL}

    Best regards,
    SAACS Plan of Study System
    gradinfo@cs.vt.edu
    """
    html_body = f"""
    <html>
        <body>
            <h2>Plan(s) of Study Awaiting Your Review</h2>
            <p>You have <strong>{len(pos_entries)}</strong> Plan(s) of Study awaiting your review.</p>
            
            <h3>Status: {status_name}</h3>
            
            {pos_list_html}
            
            <p style="margin-top: 20px;">Please log into the SAACS Plan of Study system to review these submissions.</p>
            
            <p>For more information, visit: <a href="{SITE_URL}">{SITE_URL}</a></p>
            
            <p>Best regards,<br>
            SAACS Plan of Study System<br>
            gradinfo@cs.vt.edu</p>
        </body>
    </html>
    """
    return send_email(get_user_email(faculty_pid), subject, html_body, text_body)

def student_emailer():
    """
    Send emails to students for APPROVED or REJECTED status changes.
    Students get simple text emails notifying them of approval or rejection.
    """
    print("=" * 80)
    print("[STUDENT_EMAILER] ===== START STUDENT EMAILER =====")
    print("=" * 80)
    try:
        print("[STUDENT_EMAILER] Connecting to database...")
        conn = get_db_conn()
        cursor = conn.cursor(dictionary=True)
        
        print("[STUDENT_EMAILER] Querying POS plans with status APPROVED (6) or REJECTED (99)...")
        cursor.execute("""
            SELECT 
                p.pos_id,
                p.pid,
                p.current_status
            FROM POS_PlanOfStudy p
            WHERE
                p.current_status IN (6, 99)
            ORDER BY p.pos_id DESC
            LIMIT 100
        """)
        plans = cursor.fetchall()
        print(f"[STUDENT_EMAILER] Found {len(plans)} plans to process")

        if len(plans) == 0:
            print("[SYSTEM] No student POS status changes to email")
            cursor.close()
            conn.close()
            return

        keys = []  # list of pos_ids for update

        # Process each plan
        print(f"[STUDENT_EMAILER] Processing {len(plans)} plans...")
        for i, plan in enumerate(plans, 1):
            pos_id = plan['pos_id']
            pid = plan['pid']
            current_status = plan['current_status']
            status_name = STATUS_MAP.get(current_status, f"Unknown({current_status})")

            print(f"[STUDENT_EMAILER] [{i}/{len(plans)}] Processing POS {pos_id}, Student {pid}, Status {status_name}")
            try:
                if current_status == POS_STATUS["APPROVED"]:
                    # Check POS_History for most recent entry for this plan_of_study
                    cursor.execute("""
                        SELECT history_status, date_changed FROM POS_History
                        WHERE plan_of_study = %s
                        ORDER BY date_changed DESC LIMIT 1
                    """, (pos_id,))
                    history = cursor.fetchone()
                    if history:
                        history_status = history.get("history_status")
                        date_changed = history.get("date_changed")
                        print(f"[STUDENT_EMAILER]   Most recent history: status={history_status}, date_changed={date_changed}")
                        
                        # Only send email if most recent history status is 6 (APPROVED)
                        if history_status != 6:
                            print(f"[STUDENT_EMAILER]   Most recent history status is {history_status}, not 6 (APPROVED), skipping email")
                            continue
                        
                        if date_changed:
                            # Convert to datetime
                            if isinstance(date_changed, str):
                                date_changed_dt = datetime.fromisoformat(date_changed)
                            else:
                                date_changed_dt = date_changed
                            now = datetime.now()
                            delta = now - date_changed_dt
                            hours_ago = delta.total_seconds() / 3600
                            print(f"[STUDENT_EMAILER]   Approval change was {hours_ago:.2f} hours ago")
                            if delta.total_seconds() >= 24 * 3600:
                                print(f"[STUDENT_EMAILER]   Approval was 24+ hours ago, skipping email for POS {pos_id}")
                                continue
                        else:
                            print(f"[STUDENT_EMAILER]   No date_changed found in history, skipping email")
                            continue
                    else:
                        print(f"[STUDENT_EMAILER]   No history found for POS {pos_id}, skipping email")
                        continue
                    
                    # Send approval email
                    print(f"[STUDENT_EMAILER]   Status is APPROVED and within 24 hours, sending approval email...")
                    if student_approved_email(pid):
                        keys.append(pos_id)
                        print(f"[SYSTEM] Sent approval email to {pid} for POS {pos_id}")
                    else:
                        print(f"[STUDENT_EMAILER]   Failed to send approval email for POS {pos_id}")

                elif current_status == POS_STATUS["REJECTED"]:
                    print(f"[STUDENT_EMAILER]   Status is REJECTED, sending rejection email...")
                    if student_rejected_email(pid):
                        keys.append(pos_id)
                        print(f"[SYSTEM] Sent rejection email to {pid} for POS {pos_id}")
                    else:
                        print(f"[STUDENT_EMAILER]   Failed to send rejection email for POS {pos_id}")

            except Exception as e:
                print(f"[ERROR] Failed to process POS {pos_id} for student {pid}: {e}")
                print(f"[ERROR] Traceback: {traceback.format_exc()}")
                continue

        cursor.close()
        conn.close()
        print("=" * 80)
        print(f"[STUDENT_EMAILER] ===== COMPLETE: Processed {len(keys)} student POS status changes =====")
        print("=" * 80)
        
    except Exception as e:
        print(f"[ERROR] Student emailer failed: {e}")
        print(f"[ERROR] Traceback: {traceback.format_exc()}")

def faculty_emailer():
    """
    Send emails to faculty for specific POS statuses.
    - Status 2, 4, 5: Faculty with permissions >= 8 (Gradmin, Grad_DH, or higher)
    - Status 3: Faculty with permissions = 2 (Grad_Advisor)
    Faculty receives an HTML email with a list of all POS entries in that status.
    """
    print("=" * 80)
    print("[FACULTY_EMAILER] ===== START FACULTY EMAILER =====")
    print("=" * 80)
    try:
        print("[FACULTY_EMAILER] Connecting to database...")
        conn = get_db_conn()
        cursor = conn.cursor(dictionary=True)
        
        # Query to get POS plans that need faculty review
        print("[FACULTY_EMAILER] Querying POS plans with statuses 2 (PENDING_GRADUATE_COORDINATOR), 3 (PENDING_FACULTY), 4 (AWAITING_KEY), 5 (PENDING_GRADUATE_SCHOOL)...")
        cursor.execute("""
            SELECT 
                p.pos_id,
                p.pid,
                p.pos_type,
                p.committee_chair,
                p.current_status
            FROM POS_PlanOfStudy p
            WHERE 
                p.current_status IN (2, 3, 4, 5)
            ORDER BY p.pos_id DESC
        """)
        
        plans = cursor.fetchall()
        print(f"[FACULTY_EMAILER] Found {len(plans)} plans to process")
        
        if len(plans) == 0:
            print("[SYSTEM] No faculty POS status changes to email")
            cursor.close()
            conn.close()
            return
        
        # Organize plans by status
        print("[FACULTY_EMAILER] Organizing plans by status...")
        plans_by_status = {}
        for plan in plans:
            status_id = plan['current_status']
            if status_id not in plans_by_status:
                plans_by_status[status_id] = []
            plans_by_status[status_id].append(plan)
        
        print(f"[FACULTY_EMAILER] Found plans for statuses: {list(plans_by_status.keys())}")
        for status_id, status_plans in plans_by_status.items():
            print(f"[FACULTY_EMAILER]   Status {status_id} ({STATUS_MAP.get(status_id, 'Unknown')}): {len(status_plans)} plans")
        
        keys = []  # list of pos_ids for update
        
        # Determine which faculty to notify based on status
        for status_id, status_plans in plans_by_status.items():
            print(f"[FACULTY_EMAILER] Processing status {status_id} with {len(status_plans)} plans...")
            try:
                # Determine permission requirements
                if status_id == POS_STATUS["PENDING_FACULTY"]:
                    # Only Grad_Advisors (permission = 2)
                    permission_query = "SELECT f.pid, f.email FROM Faculty f WHERE f.permissions = 2"
                    print(f"[FACULTY_EMAILER]   Status {status_id} (PENDING_FACULTY) - querying faculty with permission = 2 (Grad_Advisor)")
                
                elif status_id in [POS_STATUS["PENDING_GRADUATE_COORDINATOR"], 
                                   POS_STATUS["AWAITING_KEY"], 
                                   POS_STATUS["PENDING_GRADUATE_SCHOOL"]]:
                    # Admin/Coordinator level (permissions >= 8)
                    permission_query = "SELECT f.pid, f.email FROM Faculty f WHERE f.permissions >= 8"
                    status_name = STATUS_MAP.get(status_id, f"Status {status_id}")
                    print(f"[FACULTY_EMAILER]   Status {status_id} ({status_name}) - querying faculty with permission >= 8")
                else:
                    print(f"[FACULTY_EMAILER]   Status {status_id} - not configured for faculty notification, skipping")
                    continue
                
                print(f"[FACULTY_EMAILER]   Executing permission query...")
                cursor.execute(permission_query)
                faculty_members = cursor.fetchall()
                print(f"[FACULTY_EMAILER]   Found {len(faculty_members)} eligible faculty members")
                
                if not faculty_members:
                    print(f"[WARNING] No faculty found for status {status_id}")
                    continue
                
                # Send email to each eligible faculty member
                print(f"[FACULTY_EMAILER]   Sending notification emails to {len(faculty_members)} faculty members...")
                for i, faculty in enumerate(faculty_members, 1):
                    faculty_pid = faculty['pid']
                    print(f"[FACULTY_EMAILER]   [{i}/{len(faculty_members)}] Notifying faculty {faculty_pid}...")
                    try:
                        # Filter plans based on status
                        if status_id == POS_STATUS["PENDING_FACULTY"]:
                            # For status 3, only send plans where this faculty is the committee chair
                            filtered_plans = [plan for plan in status_plans if plan['committee_chair'] == faculty_pid]
                            print(f"[FACULTY_EMAILER]     Filtered {len(status_plans)} plans to {len(filtered_plans)} where faculty is committee chair")
                            if not filtered_plans:
                                print(f"[FACULTY_EMAILER]     No relevant plans for {faculty_pid}, skipping")
                                continue
                            plans_to_send = filtered_plans
                        else:
                            # For statuses 2, 4, 5, send all plans to all eligible faculty
                            plans_to_send = status_plans
                        
                        # faculty_notification_email expects (faculty_pid, pos_entries, status)
                        if faculty_notification_email(faculty_pid, plans_to_send, status_id):
                            faculty_email = get_user_email(faculty_pid)
                            print(f"[SYSTEM] Sent {status_id} notification to {faculty_pid} ({faculty_email}) for {len(plans_to_send)} POS entries")
                        else:
                            print(f"[FACULTY_EMAILER]     Failed to send email to faculty {faculty_pid}")
                    
                    except Exception as e:
                        print(f"[ERROR] Failed to send email to faculty {faculty_pid}: {e}")
                        print(f"[ERROR] Traceback: {traceback.format_exc()}")
                        continue
                
            except Exception as e:
                print(f"[ERROR] Failed to process status {status_id}: {e}")
                print(f"[ERROR] Traceback: {traceback.format_exc()}")
                continue
        cursor.close()
        conn.close()
        print("=" * 80)
        print(f"[FACULTY_EMAILER] ===== COMPLETE: Processed faculty notifications =====")
        print("=" * 80)
        
    except Exception as e:
        print(f"[ERROR] Faculty emailer failed: {e}")
        print(f"[ERROR] Traceback: {traceback.format_exc()}")

# ============================================================================
# MAIN EXECUTION - Routes to appropriate emailer based on JOB environment variable
# ============================================================================
print("=" * 80)
print("[MAIN] Starting job routing...")
job_type = os.getenv("job", "none")
print(f"[MAIN] JOB environment variable: '{job_type}'")
print("=" * 80)

match job_type:
    case "faculty":
        print("[MAIN] Running FACULTY emailer only")
        faculty_emailer()
    case "pos-student":
        print("[MAIN] Running STUDENT emailer only")
        student_emailer()
    case _:
        print(f'[MAIN] No valid "job" provided (got "{job_type}"), running both emailers!')
        faculty_emailer()
        student_emailer()

print("=" * 80)
print("[MAIN] ===== pos-emailer.py COMPLETE =====")
print("=" * 80)
-- ============================================================
--  INSTITUTE SCHEDULE MANAGER — PostgreSQL Schema v1.0
--  Stack: Node.js + PostgreSQL
--  Run order: Execute this file once on a fresh database
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
--  ENUMS
-- ============================================================

CREATE TYPE user_role        AS ENUM ('admin', 'teacher', 'student');
CREATE TYPE day_of_week      AS ENUM ('monday','tuesday','wednesday','thursday','friday','saturday','sunday');
CREATE TYPE class_status     AS ENUM ('scheduled','ongoing','completed','cancelled','rescheduled');
CREATE TYPE attendance_status AS ENUM ('present','late','absent','excused','technical_issue');
CREATE TYPE leave_type       AS ENUM ('annual','sick','emergency','personal');
CREATE TYPE leave_status     AS ENUM ('pending','approved','rejected');
CREATE TYPE meeting_platform AS ENUM ('skype','google_meet','microsoft_teams','moodle','custom');
CREATE TYPE notification_channel AS ENUM ('email','in_app','whatsapp','sms');
CREATE TYPE notification_status  AS ENUM ('pending','sent','failed');

-- ============================================================
--  USERS  (shared auth table for all roles)
-- ============================================================

CREATE TABLE users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT        NOT NULL,
    role            user_role   NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    phone           VARCHAR(30),
    avatar_url      TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email  ON users(email);
CREATE INDEX idx_users_role   ON users(role);

-- ============================================================
--  TEACHERS
-- ============================================================

CREATE TABLE teachers (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    employee_code       VARCHAR(50) UNIQUE,
    max_hours_per_day   NUMERIC(4,2) NOT NULL DEFAULT 8.0,
    weekly_off_day      day_of_week NOT NULL DEFAULT 'friday',
    buffer_minutes      INTEGER     NOT NULL DEFAULT 10,   -- gap required between classes
    bio                 TEXT,
    joining_date        DATE,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX idx_teachers_user_id ON teachers(user_id);

-- ============================================================
--  SUBJECTS
-- ============================================================

CREATE TABLE subjects (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL UNIQUE,
    code        VARCHAR(50)  UNIQUE,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
--  TEACHER EXPERTISE  (many-to-many: teachers ↔ subjects)
-- ============================================================

CREATE TABLE teacher_expertise (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id  UUID        NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    subject_id  UUID        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    proficiency VARCHAR(20) NOT NULL DEFAULT 'primary'  -- primary | secondary
        CHECK (proficiency IN ('primary','secondary')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(teacher_id, subject_id)
);

CREATE INDEX idx_expertise_teacher ON teacher_expertise(teacher_id);
CREATE INDEX idx_expertise_subject ON teacher_expertise(subject_id);

-- ============================================================
--  STUDENTS
-- ============================================================

CREATE TABLE students (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_code    VARCHAR(50) UNIQUE,
    date_of_birth   DATE,
    guardian_name   VARCHAR(255),
    guardian_phone  VARCHAR(30),
    notes           TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    enrolled_at     DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- ============================================================
--  COURSES
-- ============================================================

CREATE TABLE courses (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    code            VARCHAR(50)  UNIQUE,
    description     TEXT,
    total_sessions  INTEGER,     -- planned number of sessions
    duration_weeks  INTEGER,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
--  COURSE SUBJECTS  (subjects that belong to a course)
-- ============================================================

CREATE TABLE course_subjects (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id   UUID    NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    subject_id  UUID    NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    UNIQUE(course_id, subject_id)
);

-- ============================================================
--  STUDENT GROUPS
-- ============================================================

CREATE TABLE student_groups (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    course_id   UUID        REFERENCES courses(id) ON DELETE SET NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE student_group_members (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    UUID    NOT NULL REFERENCES student_groups(id) ON DELETE CASCADE,
    student_id  UUID    NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(group_id, student_id)
);

-- ============================================================
--  COURSE ENROLLMENTS  (student enrolled in a course)
-- ============================================================

CREATE TABLE course_enrollments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    course_id       UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrolled_at     DATE        NOT NULL DEFAULT CURRENT_DATE,
    completed_at    DATE,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    UNIQUE(student_id, course_id)
);

CREATE INDEX idx_enrollments_student ON course_enrollments(student_id);
CREATE INDEX idx_enrollments_course  ON course_enrollments(course_id);

-- ============================================================
--  CLASSES  (the core scheduling entity)
-- ============================================================

CREATE TABLE classes (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    title               VARCHAR(255),   -- optional override title
    course_id           UUID            REFERENCES courses(id) ON DELETE SET NULL,
    subject_id          UUID            NOT NULL REFERENCES subjects(id),
    teacher_id          UUID            NOT NULL REFERENCES teachers(id),

    -- Timing
    scheduled_date      DATE            NOT NULL,
    start_time          TIME            NOT NULL,
    end_time            TIME            NOT NULL,
    duration_minutes    INTEGER         NOT NULL,   -- 40 | 60 | custom

    -- Meeting
    platform            meeting_platform NOT NULL DEFAULT 'google_meet',
    meeting_link        TEXT,
    meeting_id          VARCHAR(255),   -- platform-specific room ID

    -- Status & meta
    status              class_status    NOT NULL DEFAULT 'scheduled',
    is_recurring        BOOLEAN         NOT NULL DEFAULT FALSE,
    recurrence_rule_id  UUID,           -- FK set after recurrence_rules table
    cancelled_reason    TEXT,
    rescheduled_from_id UUID            REFERENCES classes(id) ON DELETE SET NULL,
    notes               TEXT,

    created_by          UUID            NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_classes_teacher_date  ON classes(teacher_id, scheduled_date);
CREATE INDEX idx_classes_date          ON classes(scheduled_date);
CREATE INDEX idx_classes_status        ON classes(status);
CREATE INDEX idx_classes_course        ON classes(course_id);

-- ============================================================
--  RECURRENCE RULES  (weekly / daily / monthly patterns)
-- ============================================================

CREATE TABLE recurrence_rules (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    frequency       VARCHAR(20) NOT NULL CHECK (frequency IN ('daily','weekly','monthly','custom')),
    days_of_week    day_of_week[],       -- e.g. {monday, wednesday, friday}
    start_date      DATE        NOT NULL,
    end_date        DATE,
    total_sessions  INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Now add the FK from classes → recurrence_rules
ALTER TABLE classes
    ADD CONSTRAINT fk_classes_recurrence
    FOREIGN KEY (recurrence_rule_id) REFERENCES recurrence_rules(id) ON DELETE SET NULL;

-- ============================================================
--  CLASS STUDENTS  (which students are in a class)
-- ============================================================

CREATE TABLE class_students (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id    UUID    NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id  UUID    NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    group_id    UUID    REFERENCES student_groups(id) ON DELETE SET NULL,  -- if added via group
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(class_id, student_id)
);

CREATE INDEX idx_class_students_class   ON class_students(class_id);
CREATE INDEX idx_class_students_student ON class_students(student_id);

-- ============================================================
--  ATTENDANCE
-- ============================================================

CREATE TABLE attendance (
    id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id        UUID                NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id      UUID                NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    status          attendance_status   NOT NULL,
    late_minutes    INTEGER,            -- only set when status = 'late'
    remarks         TEXT,
    marked_by       UUID                NOT NULL REFERENCES users(id),  -- teacher or admin
    marked_at       TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    UNIQUE(class_id, student_id)
);

CREATE INDEX idx_attendance_class   ON attendance(class_id);
CREATE INDEX idx_attendance_student ON attendance(student_id);
CREATE INDEX idx_attendance_status  ON attendance(status);

-- ============================================================
--  TEACHER LEAVE REQUESTS
-- ============================================================

CREATE TABLE leave_requests (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id      UUID        NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    leave_type      leave_type  NOT NULL,
    start_date      DATE        NOT NULL,
    end_date        DATE        NOT NULL,
    reason          TEXT        NOT NULL,
    attachment_url  TEXT,
    status          leave_status NOT NULL DEFAULT 'pending',
    reviewed_by     UUID        REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    review_notes    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_date >= start_date)
);

CREATE INDEX idx_leave_teacher ON leave_requests(teacher_id);
CREATE INDEX idx_leave_status  ON leave_requests(status);
CREATE INDEX idx_leave_dates   ON leave_requests(start_date, end_date);

-- ============================================================
--  NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
    id          UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID                    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       VARCHAR(255)            NOT NULL,
    body        TEXT                    NOT NULL,
    channel     notification_channel    NOT NULL DEFAULT 'in_app',
    status      notification_status     NOT NULL DEFAULT 'pending',
    read_at     TIMESTAMPTZ,
    sent_at     TIMESTAMPTZ,
    metadata    JSONB,                  -- extra data (class_id, leave_id, etc.)
    created_at  TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user   ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);

-- ============================================================
--  AUDIT LOG  (all important changes tracked)
-- ============================================================

CREATE TABLE audit_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(100) NOT NULL,   -- e.g. 'class.created', 'leave.approved'
    entity_type VARCHAR(50)  NOT NULL,   -- e.g. 'class', 'leave_request'
    entity_id   UUID,
    old_data    JSONB,
    new_data    JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity   ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_user     ON audit_log(user_id);
CREATE INDEX idx_audit_created  ON audit_log(created_at);

-- ============================================================
--  SYSTEM SETTINGS  (global configurable values)
-- ============================================================

CREATE TABLE system_settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       TEXT         NOT NULL,
    description TEXT,
    updated_by  UUID         REFERENCES users(id),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Default settings
INSERT INTO system_settings (key, value, description) VALUES
    ('default_buffer_minutes',   '10',     'Default gap between back-to-back classes'),
    ('default_max_hours_per_day','8',      'Default max teaching hours per teacher per day'),
    ('default_weekly_off',       'friday', 'Default weekly off day for all teachers'),
    ('class_reminder_minutes',   '15',     'Minutes before class to send reminder notification'),
    ('attendance_grace_minutes', '30',     'Minutes after class end to allow attendance submission');

-- ============================================================
--  UPDATED_AT TRIGGER FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'users','teachers','students','courses',
        'student_groups','course_enrollments','classes',
        'attendance','leave_requests'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON %s
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            t, t
        );
    END LOOP;
END $$;

-- ============================================================
--  CONFLICT CHECK FUNCTION
--  Returns TRUE if teacher has a conflict in the given slot
-- ============================================================

CREATE OR REPLACE FUNCTION check_teacher_conflict(
    p_teacher_id    UUID,
    p_date          DATE,
    p_start_time    TIME,
    p_end_time      TIME,
    p_exclude_class UUID DEFAULT NULL   -- pass class ID when updating
)
RETURNS BOOLEAN AS $$
DECLARE
    v_conflict_count INTEGER;
    v_buffer         INTEGER;
BEGIN
    SELECT COALESCE(buffer_minutes, 10)
    INTO v_buffer
    FROM teachers WHERE id = p_teacher_id;

    SELECT COUNT(*) INTO v_conflict_count
    FROM classes
    WHERE teacher_id = p_teacher_id
      AND scheduled_date = p_date
      AND status NOT IN ('cancelled')
      AND (p_exclude_class IS NULL OR id != p_exclude_class)
      AND (
            -- new class starts inside existing class (with buffer)
            p_start_time < (end_time + (v_buffer || ' minutes')::INTERVAL)
            AND
            p_end_time > (start_time - (v_buffer || ' minutes')::INTERVAL)
          );

    RETURN v_conflict_count > 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
--  DAILY HOURS CHECK FUNCTION
--  Returns total scheduled hours for a teacher on a date
-- ============================================================

CREATE OR REPLACE FUNCTION get_teacher_daily_hours(
    p_teacher_id UUID,
    p_date       DATE
)
RETURNS NUMERIC AS $$
DECLARE
    v_total_minutes INTEGER;
BEGIN
    SELECT COALESCE(SUM(duration_minutes), 0)
    INTO v_total_minutes
    FROM classes
    WHERE teacher_id = p_teacher_id
      AND scheduled_date = p_date
      AND status NOT IN ('cancelled');

    RETURN ROUND(v_total_minutes::NUMERIC / 60, 2);
END;
$$ LANGUAGE plpgsql;

// src/config/init-db.js
// Run this once after Railway PostgreSQL is provisioned:
//   node src/config/init-db.js
// Or set as a one-off Railway job.

require('dotenv').config();
const { pool } = require('./database');
const fs       = require('fs');
const path     = require('path');
const bcrypt   = require('bcryptjs');

async function initDatabase() {
  const client = await pool.connect();

  try {
    console.log('🔄 Connecting to database...');
    await client.query('SELECT 1');
    console.log('✅ Connected');

    // ── Check if already initialized ──────────────────────
    const check = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
      ) AS exists
    `);

    if (check.rows[0].exists) {
      console.log('⚠️  Database already initialized — skipping schema.');
    } else {
      console.log('🔄 Running schema...');
      const schema = fs.readFileSync(
        path.join(__dirname, '../../../database/001_schema.sql'), 'utf8'
      );
      await client.query(schema);
      console.log('✅ Schema applied');
    }

    // ── Seed admin user if not present ────────────────────
    const adminCheck = await client.query(
      "SELECT id FROM users WHERE email = 'admin@institute.com'"
    );

    if (!adminCheck.rows.length) {
      console.log('🔄 Seeding default admin user...');

      const adminPass   = process.env.ADMIN_PASSWORD   || 'Admin@1234';
      const teacher1Pass = process.env.TEACHER_PASSWORD || 'Teacher@1234';
      const studentPass  = process.env.STUDENT_PASSWORD || 'Student@1234';

      const [adminHash, teacherHash, studentHash] = await Promise.all([
        bcrypt.hash(adminPass,    12),
        bcrypt.hash(teacher1Pass, 12),
        bcrypt.hash(studentPass,  12),
      ]);

      // Admin
      await client.query(`
        INSERT INTO users (id, email, password_hash, role, full_name, phone) VALUES
        ('00000000-0000-0000-0000-000000000001', 'admin@institute.com',    $1, 'admin',   'Principal Ahmed',  '+923001234567'),
        ('00000000-0000-0000-0000-000000000002', 'teacher1@institute.com', $2, 'teacher', 'Mr. Hassan Raza',  '+923011234567'),
        ('00000000-0000-0000-0000-000000000003', 'teacher2@institute.com', $2, 'teacher', 'Ms. Sara Malik',   '+923021234567'),
        ('00000000-0000-0000-0000-000000000004', 'teacher3@institute.com', $2, 'teacher', 'Mr. Bilal Khan',   '+923031234567'),
        ('00000000-0000-0000-0000-000000000005', 'student1@institute.com', $3, 'student', 'Ali Usman',        '+923041234567'),
        ('00000000-0000-0000-0000-000000000006', 'student2@institute.com', $3, 'student', 'Fatima Noor',      '+923051234567'),
        ('00000000-0000-0000-0000-000000000007', 'student3@institute.com', $3, 'student', 'Zain Ahmed',       '+923061234567'),
        ('00000000-0000-0000-0000-000000000008', 'student4@institute.com', $3, 'student', 'Hina Tariq',       '+923071234567')
        ON CONFLICT (email) DO NOTHING
      `, [adminHash, teacherHash, studentHash]);

      // Teachers
      await client.query(`
        INSERT INTO teachers (id, user_id, employee_code, max_hours_per_day, weekly_off_day, buffer_minutes) VALUES
        ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'TCH-001', 8, 'friday',   10),
        ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'TCH-002', 8, 'friday',   10),
        ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', 'TCH-003', 8, 'saturday', 10)
        ON CONFLICT DO NOTHING
      `);

      // Students
      await client.query(`
        INSERT INTO students (id, user_id, student_code) VALUES
        ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'STU-001'),
        ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'STU-002'),
        ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000007', 'STU-003'),
        ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000008', 'STU-004')
        ON CONFLICT DO NOTHING
      `);

      // Subjects
      await client.query(`
        INSERT INTO subjects (id, name, code) VALUES
        ('20000000-0000-0000-0000-000000000001', 'Mathematics',      'MATH'),
        ('20000000-0000-0000-0000-000000000002', 'Physics',          'PHY'),
        ('20000000-0000-0000-0000-000000000003', 'English Language', 'ENG'),
        ('20000000-0000-0000-0000-000000000004', 'Computer Science', 'CS'),
        ('20000000-0000-0000-0000-000000000005', 'Chemistry',        'CHEM')
        ON CONFLICT DO NOTHING
      `);

      // Expertise
      await client.query(`
        INSERT INTO teacher_expertise (teacher_id, subject_id, proficiency) VALUES
        ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'primary'),
        ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'secondary'),
        ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'primary'),
        ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000005', 'secondary'),
        ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004', 'primary')
        ON CONFLICT DO NOTHING
      `);

      // Courses
      await client.query(`
        INSERT INTO courses (id, name, code, total_sessions, duration_weeks) VALUES
        ('40000000-0000-0000-0000-000000000001', 'O-Level Mathematics',    'OL-MATH', 48, 16),
        ('40000000-0000-0000-0000-000000000002', 'IELTS Preparation',      'IELTS',   36, 12),
        ('40000000-0000-0000-0000-000000000003', 'Web Development Basics', 'WEB-101', 24, 8)
        ON CONFLICT DO NOTHING
      `);

      console.log('✅ Seed data inserted');
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  LOGIN CREDENTIALS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`  Admin:    admin@institute.com   / ${adminPass}`);
      console.log(`  Teacher:  teacher1@institute.com / ${teacher1Pass}`);
      console.log(`  Student:  student1@institute.com / ${studentPass}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } else {
      console.log('⚠️  Seed users already exist — skipping seed.');
    }

    console.log('');
    console.log('✅ Database initialization complete.');

  } catch (err) {
    console.error('❌ Database init failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

initDatabase();

#!/usr/bin/env python3
"""
Run database migration for Google Classroom integration.
Usage: python run_migration.py
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'mathmind.db')
MIGRATION_PATH = os.path.join(os.path.dirname(__file__), '..', 'db_migrations', '001_add_google_fields.sql')

def run_migration():
    """Run the migration SQL file."""
    
    # Check if migration file exists
    if not os.path.exists(MIGRATION_PATH):
        print(f'❌ Migration file not found: {MIGRATION_PATH}')
        return False
    
    # Read migration SQL
    with open(MIGRATION_PATH, 'r') as f:
        migration_sql = f.read()
    
    # Connect to database
    conn = sqlite3.connect(DB_PATH)
    conn.execute('PRAGMA foreign_keys = ON')
    
    try:
        # Execute migration statements one by one (handle duplicates gracefully)
        statements = [s.strip() for s in migration_sql.split(';') if s.strip()]
        
        success_count = 0
        skip_count = 0
        
        for stmt in statements:
            if not stmt:
                continue
            try:
                conn.execute(stmt)
                success_count += 1
            except sqlite3.OperationalError as e:
                error_msg = str(e).lower()
                if 'duplicate column' in error_msg or 'duplicate column name' in error_msg:
                    # Skip duplicate column errors
                    skip_count += 1
                else:
                    raise
        
        conn.commit()
        
        print('✅ Migration completed successfully!')
        print(f'   Applied: {success_count} statements')
        print(f'   Skipped (duplicates): {skip_count} statements')
        print()
        
        # Verify tables
        print('Verifying tables...')
        tables = conn.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name IN ('teachers', 'students', 'quizzes')
        """).fetchall()
        
        print(f'   Found tables: {[t[0] for t in tables]}')
        
        # Check teachers columns
        print()
        print('Teachers table columns:')
        columns = conn.execute('PRAGMA table_info(teachers)').fetchall()
        for col in columns:
            print(f'   - {col[1]} ({col[2]})')
        
        # Check students columns
        print()
        print('Students table columns:')
        columns = conn.execute('PRAGMA table_info(students)').fetchall()
        for col in columns:
            print(f'   - {col[1]} ({col[2]})')
        
        # Check quizzes columns
        print()
        print('Quizzes table columns:')
        columns = conn.execute('PRAGMA table_info(quizzes)').fetchall()
        for col in columns:
            print(f'   - {col[1]} ({col[2]})')
        
        print()
        print('✅ All migrations applied successfully!')
        return True
        
    except Exception as e:
        conn.rollback()
        print(f'❌ Migration failed: {e}')
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        conn.close()


if __name__ == '__main__':
    run_migration()

from django.db import migrations

def force_repair_schema(apps, schema_editor):
    from django.db import connection
    cursor = connection.cursor()

    # 1. Enable PGVector (required for students face embedding)
    try:
        cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    except Exception:
        pass # Might not have superuser, but usually cloud instances handle this

    # 2. Force add missing columns to ensure 2026 B2B spec
    # Even if Django thinks it did them, we check physically
    table_column_pairs = [
        ('schools_user', 'firebase_uid', 'varchar(200)'),
        ('schools_user', 'organisation_id', 'uuid'),
        ('schools_school', 'organisation_id', 'uuid'),
        ('schools_transporter', 'organisation_id', 'uuid'),
        ('buses_bus', 'organisation_id', 'uuid'),
        ('buses_route', 'organisation_id', 'uuid'),
        ('students_student', 'organisation_id', 'uuid'),
        ('students_parent', 'organisation_id', 'uuid'),
    ]

    for table, column, col_type in table_column_pairs:
        try:
            # Check if column exists
            cursor.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name='{table}' AND column_name='{column}';")
            if not cursor.fetchone():
                print(f"Repairing: Adding {column} to {table}")
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type};")
        except Exception as e:
            print(f"Error repairing {table}.{column}: {e}")

    # 3. Ensure unified groups exist physically
    Group = apps.get_model('auth', 'Group')
    for name in ['Admin', 'Manager', 'Viewer', 'Parent']:
        Group.objects.get_or_create(name=name)

class Migration(migrations.Migration):

    dependencies = [
        ("schools", "0002_user_firebase_uid_alter_school_name_and_more"),
    ]

    operations = [
        migrations.RunPython(force_repair_schema, reverse_code=migrations.RunPython.noop),
    ]

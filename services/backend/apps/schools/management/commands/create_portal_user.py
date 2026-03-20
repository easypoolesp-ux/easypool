"""
Management command: create_portal_user

Creates a Django user for Firebase-based authentication.
No password is stored — the user authenticates via Firebase only.

Usage:
    python manage.py create_portal_user \
        --email "admin@school.com" \
        --name "School Admin" \
        --group SchoolAdmin \
        --school "Springfield School"

    python manage.py create_portal_user \
        --email "manager@transporter.com" \
        --name "Transport Manager" \
        --group Transporter \
        --transporter "Express Bus Liners"

Groups (create in Django Admin first):
    SuperAdmin, SchoolAdmin, Transporter, Parent
"""
from django.core.management.base import BaseCommand, CommandError
from apps.schools.models import User


class Command(BaseCommand):
    help = 'Create a portal user authenticated via Firebase (no Django password stored).'

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True, help='User email address (must match Firebase)')
        parser.add_argument('--name', required=True, help='User full name')
        parser.add_argument(
            '--group', required=True,
            choices=['SuperAdmin', 'SchoolAdmin', 'Transporter', 'Parent'],
            help='Django Group to assign (controls what the user can see)'
        )
        parser.add_argument('--school', default=None, help='School name to associate with user (optional)')
        parser.add_argument('--transporter', default=None, help='Transporter name to associate with user (optional)')

    def handle(self, *args, **options):
        email = options['email'].lower().strip()
        full_name = options['name'].strip()
        group_name = options['group']
        school_name = options.get('school')

        if User.objects.filter(email=email).exists():
            raise CommandError(f"A user with email '{email}' already exists.")

        school = None
        if school_name:
            from apps.schools.models import School
            try:
                school = School.objects.get(name__iexact=school_name)
            except School.DoesNotExist:
                raise CommandError(
                    f"School '{school_name}' not found. "
                    "Create it in Django Admin first, then run this command again."
                )

        transporter_name = options.get('transporter')
        transporter = None
        if transporter_name:
            from apps.schools.models import Transporter
            try:
                transporter = Transporter.objects.get(name__iexact=transporter_name)
            except Transporter.DoesNotExist:
                raise CommandError(
                    f"Transporter '{transporter_name}' not found. "
                    "Create it in Django Admin first, then run this command again."
                )

        user = User.objects.create_portal_user(
            email=email,
            full_name=full_name,
            group_name=group_name,
            school=school,
            transporter=transporter,
        )

        self.stdout.write(self.style.SUCCESS(
            f"\nUser created successfully:\n"
            f"  Email:       {user.email}\n"
            f"  Name:        {user.full_name}\n"
            f"  Group:       {group_name}\n"
            f"  School:      {school.name if school else 'None'}\n"
            f"  Transporter: {transporter.name if transporter else 'None'}\n"
            f"\nIMPORTANT: Now add this email to Firebase Authentication\n"
            f"  Firebase Console -> Authentication -> Users -> Add User\n"
            f"  Email: {user.email}\n"
            f"  The user will set their own password via Firebase on first login.\n"
        ))

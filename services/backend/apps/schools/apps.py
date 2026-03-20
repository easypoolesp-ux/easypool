from django.apps import AppConfig


def _create_portal_groups(sender, **kwargs):
    """
    Seeds the standard portal Groups after every migration.
    This is Django's recommended pattern for structural initial data —
    the same way Django seeds ContentType and Permission entries internally.
    Groups are idempotent (get_or_create), so this is safe to run repeatedly.
    """
    from django.contrib.auth.models import Group
    for name in ['SuperAdmin', 'SchoolAdmin', 'Transporter', 'Parent', 'CarpoolAdmin']:
        Group.objects.get_or_create(name=name)


class SchoolsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.schools'

    def ready(self):
        from django.db.models.signals import post_migrate
        post_migrate.connect(_create_portal_groups, sender=self)

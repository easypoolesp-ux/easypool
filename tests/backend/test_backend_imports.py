import pytest
import importlib


def test_backend_apps_import():
    """Verify core backend apps can be imported."""
    apps_to_test = [
        "apps.buses.models",
        "apps.gps.views",
        "config.settings",
    ]
    for app in apps_to_test:
        try:
            importlib.import_module(app)
        except ImportError as e:
            pytest.fail(f"Failed to import {app}: {e}")


def test_django_init():
    """Verify Django initializes correctly."""
    import django
    from django.conf import settings

    assert settings.configured
    django.setup()

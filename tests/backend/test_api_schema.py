import pytest
import schemathesis
from django.urls import reverse
from schemathesis.models import Case

# Load the schema from the Spectacular OpenAPI view
# WSGI traversal allows testing without a running server
schema = schemathesis.from_wsgi("/api/schema/", "config.wsgi.application")

@schemathesis.check
def no_500(response, case):
    """Custom check to ensure no internal server errors."""
    if response.status_code >= 500:
        raise AssertionError(f"Endpoint {case.path} returned {response.status_code}")

@schema.parametrize()
def test_api_integrity(case: Case):
    """
    Automated API Fuzzing:
    Schemathesis generates cases for all endpoints automatically.
    """
    response = case.call()
    case.validate_response(response)
    no_500(response, case)

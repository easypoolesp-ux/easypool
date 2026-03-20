import firebase_admin
from decouple import config
from firebase_admin import auth, credentials
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission

from apps.schools.models import User

# ── Firebase Admin SDK Initialization ─────────────────────────────────────────
# projectId must be set explicitly when the Cloud Run service account project
# (project-05588bf2) differs from the Firebase project (easypool-global).
if not firebase_admin._apps:
    path = config('FIREBASE_SERVICE_ACCOUNT_PATH', default=None)
    firebase_project_id = config('FIREBASE_PROJECT_ID', default='easypool-global')
    cred = credentials.Certificate(path) if path else credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred, {'projectId': firebase_project_id})


# ── Firebase Token Authentication ─────────────────────────────────────────────
class FirebaseAuthentication(BaseAuthentication):
    """
    Authenticates requests using a Firebase ID Token in the Authorization header.
    Maps the Firebase user to a Django User via email.
    Only users that already exist in the Django database are allowed (invite-only).
    """

    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION')
        if not auth_header or not auth_header.startswith('Bearer '):
            return None

        id_token = auth_header.split(' ').pop()

        try:
            decoded_token = auth.verify_id_token(id_token)
        except auth.ExpiredIdTokenError:
            raise AuthenticationFailed('Your session has expired. Please sign in again.')
        except auth.InvalidIdTokenError:
            raise AuthenticationFailed('Invalid session token. Please sign in again.')
        except Exception as e:
            raise AuthenticationFailed(f'Authentication failed: {str(e)}')

        uid = decoded_token.get('uid')
        email = decoded_token.get('email')

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise AuthenticationFailed(
                'Access denied. Your account is not registered in EasyPool. '
                'Please contact your administrator.'
            )

        if not user.is_active:
            raise AuthenticationFailed(
                'Your account has been deactivated. Please contact your administrator.'
            )

        # Store Firebase UID on first login
        if not user.firebase_uid:
            user.firebase_uid = uid
            user.save(update_fields=['firebase_uid'])

        return (user, None)


# ── Role-Based Permission Classes (Django Groups) ─────────────────────────────
#
# Uses Django's built-in Group system (django.contrib.auth.models.Group).
# Assign users to Groups via Django Admin panel — no code changes needed.
#
# Standard Groups to create in Django Admin:
#   - SuperAdmin     → full access
#   - SchoolAdmin    → access to their school's data only
#   - Transporter    → access to bus/route data only
#   - Parent         → read-only access to their child's route
#
# Usage on any ViewSet or APIView:
#   permission_classes = [IsAuthenticated, InGroup(['SuperAdmin', 'SchoolAdmin'])]


class IsPortalUser(BasePermission):
    """
    Baseline permission: allows any active authenticated user registered in Django.
    Use this on all views as the minimum requirement.
    """

    message = 'You do not have access to this portal. Please contact your EasyPool administrator.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_active)


class InGroup(BasePermission):
    """
    Restricts access to users who belong to one of the specified Django Groups.

    - Group membership is managed entirely from Django Admin (no code deploys needed).
    - Superusers (is_superuser=True) bypass all group checks automatically.
    - On failure, returns a clear 'contact admin' message instead of leaking data.

    Usage:
        permission_classes = [IsAuthenticated, InGroup(['SuperAdmin', 'SchoolAdmin'])]
    """

    message = (
        'You do not have permission to access this resource. '
        'Please contact your EasyPool administrator.'
    )

    def __init__(self, allowed_groups: list):
        self.allowed_groups = allowed_groups

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(name__in=self.allowed_groups).exists()

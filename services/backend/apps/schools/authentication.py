import firebase_admin
from firebase_admin import credentials, auth
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.conf import settings
from apps.schools.models import User
from decouple import config

# Initialize Firebase Admin SDK
if not firebase_admin._apps:
    path = config('FIREBASE_SERVICE_ACCOUNT_PATH', default=None)
    if path:
        cred = credentials.Certificate(path)
    else:
        # Falls back to Google Application Default Credentials
        # This allows Cloud Run seamlessly connect without local keys
        cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)

class FirebaseAuthentication(BaseAuthentication):
    def authenticate(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION")
        if not auth_header or not auth_header.startswith("Bearer "):
            return None
            
        id_token = auth_header.split(" ").pop()
        
        try:
            decoded_token = auth.verify_id_token(id_token)
            uid = decoded_token.get("uid")
            email = decoded_token.get("email")
            
            # Map Firebase User to Django User Model
            # Creates a new dispatcher/admin account if they log in via Google and don't exist yet,
            # or you can restrict this to only fetch existing users to prevent open sign-ups.
            
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
                # Optional: Auto-create user on first login, or block them
                # Since B2B is closed, we should reject unknown emails:
                raise AuthenticationFailed(f"User {email} is not registered in the EasyPool portal.")
            
            # Save the firebase ID back to the user object if they are new
            if not user.google_id:
                user.google_id = uid
                user.save(update_fields=["google_id"])
                
            return (user, None)
            
        except auth.ExpiredIdTokenError:
            raise AuthenticationFailed("Firebase token has expired.")
        except auth.InvalidIdTokenError:
            raise AuthenticationFailed("Invalid Firebase token.")
        except Exception as e:
            raise AuthenticationFailed(f"Authentication failed: {str(e)}")

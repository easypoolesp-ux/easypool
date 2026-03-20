from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import OrganisationViewSet, TransporterViewSet, UserViewSet

router = DefaultRouter()
router.register('organisations', OrganisationViewSet, basename='organisation')
router.register('schools', OrganisationViewSet, basename='school')  # Compatibility bridge
router.register('users', UserViewSet)
router.register('transporters', TransporterViewSet)

urlpatterns = [
    path('', include(router.urls)),
]

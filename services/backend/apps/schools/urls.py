from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import SchoolViewSet, TransporterViewSet, UserViewSet

router = DefaultRouter()
router.register('schools', SchoolViewSet)
router.register('users', UserViewSet)
router.register('transporters', TransporterViewSet)

urlpatterns = [
    path('', include(router.urls)),
]

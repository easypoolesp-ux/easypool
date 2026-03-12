from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SchoolViewSet, UserViewSet, TransporterViewSet

router = DefaultRouter()
router.register('schools', SchoolViewSet)
router.register('users', UserViewSet)
router.register('transporters', TransporterViewSet)

urlpatterns = [
    path('', include(router.urls)),
]

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import GPSPointViewSet, AlertViewSet

router = DefaultRouter()
router.register('gps', GPSPointViewSet)
router.register('alerts', AlertViewSet)

urlpatterns = [
    path('', include(router.urls)),
]

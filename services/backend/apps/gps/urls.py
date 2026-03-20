from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AlertViewSet, GPSPointViewSet

router = DefaultRouter()
router.register('gps', GPSPointViewSet)
router.register('alerts', AlertViewSet)

urlpatterns = [
    path('', include(router.urls)),
]

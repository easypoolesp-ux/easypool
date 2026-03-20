from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BusViewSet, RouteViewSet

router = DefaultRouter()
router.register('routes', RouteViewSet)
router.register('buses', BusViewSet)

urlpatterns = [
    path('', include(router.urls)),
]

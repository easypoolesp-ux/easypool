from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RouteViewSet, BusViewSet

router = DefaultRouter()
router.register('routes', RouteViewSet)
router.register('buses', BusViewSet)

urlpatterns = [
    path('', include(router.urls)),
]

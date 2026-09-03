# Fixture: urls.py with app_name namespace + re_path entry.
# Based on patterns from django-oscar (BSD licence, Tangent Communications PLC).
from django.urls import path, re_path
from . import views

app_name = 'shop'

urlpatterns = [
    path('', views.ShopIndexView.as_view(), name='index'),
    path('products/', views.ProductListView.as_view(), name='product-list'),
    path('products/<slug:slug>/', views.ProductDetailView.as_view(), name='product-detail'),
    re_path(r'^search/$', views.search, name='search'),
]

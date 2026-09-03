from django.urls import path

from . import views

app_name = 'blog'

urlpatterns = [
    path('', views.post_list, name='post_list'),
    path('<slug:slug>/', views.post_detail, name='post_detail'),
    path('author/<int:author_id>/', views.author_profile, name='author_profile'),
    path('tag/<slug:slug>/', views.TagArchiveView.as_view(), name='tag_archive'),
]

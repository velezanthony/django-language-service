# Fixture: Models with FK, M2M, O2O relations
# Inspired by django-oscar catalogue models
from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)


class Product(models.Model):
    name = models.CharField(max_length=255)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    # ForeignKey relation
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name='products',
    )
    # ManyToMany with explicit through
    tags = models.ManyToManyField('Tag', through='ProductTag', related_name='products')


class Tag(models.Model):
    name = models.CharField(max_length=100)


class ProductTag(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE)
    added_at = models.DateTimeField(auto_now_add=True)


class UserProfile(models.Model):
    # OneToOne relation
    user = models.OneToOneField(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='profile',
    )
    avatar = models.ImageField(upload_to='avatars/', blank=True)

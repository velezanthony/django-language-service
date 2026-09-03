# Fixture: Models with Meta class (db_table, abstract, proxy, tableComment)
# Inspired by wagtail core models
from django.db import models


class BaseContent(models.Model):
    """Abstract base model with common fields."""
    title = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Article(models.Model):
    title = models.CharField(max_length=255)
    body = models.TextField()
    slug = models.SlugField(unique=True)

    class Meta:
        db_table = 'cms_articles'
        ordering = ['-created_at']
        verbose_name = 'Article'
        verbose_name_plural = 'Articles'


class LegacyProduct(models.Model):
    """Proxy model pointing at a legacy table."""
    name = models.CharField(max_length=255)

    class Meta:
        db_table = 'old_products'
        proxy = True
        db_table_comment = 'Legacy product table from v1'

# Fixture: Django ModelForm with Meta.model and Meta.fields
# Inspired by django-oscar product form patterns
from django import forms
from .models import Product, Review


class ProductForm(forms.ModelForm):
    """ModelForm for creating/editing products."""

    class Meta:
        model = Product
        fields = ['name', 'price', 'description', 'category']


class ReviewForm(forms.ModelForm):
    """ModelForm for product reviews."""

    rating = forms.IntegerField(min_value=1, max_value=5)
    body = forms.CharField(widget=forms.Textarea)

    class Meta:
        model = Review
        fields = ['rating', 'body']


class AllFieldsForm(forms.ModelForm):
    """ModelForm using __all__ shortcut."""

    class Meta:
        model = Product
        fields = '__all__'

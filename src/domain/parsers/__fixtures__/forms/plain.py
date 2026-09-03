# Fixture: plain Django form (no Model binding)
# Inspired by django-allauth signup form patterns
from django import forms


class ContactForm(forms.Form):
    """Simple contact form with email and message."""

    email = forms.EmailField(
        max_length=254,
        help_text='Required. Enter a valid email address.',
    )
    subject = forms.CharField(max_length=100)
    message = forms.CharField(
        widget=forms.Textarea,
        max_length=2000,
    )


class SearchForm(forms.Form):
    query = forms.CharField(max_length=255, required=False)
    category = forms.ChoiceField(choices=[], required=False)

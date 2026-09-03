from django import forms
from .models import Product, Category


class ProductSearchForm(forms.Form):
    query = forms.CharField(max_length=200, required=False)
    min_price = forms.DecimalField(required=False)
    max_price = forms.DecimalField(required=False)
    category = forms.ModelChoiceField(queryset=Category.objects.all(), required=False)


class ProductForm(forms.ModelForm):
    class Meta:
        model = Product
        fields = ['name', 'slug', 'description', 'price', 'category']

    def clean_price(self):
        price = self.cleaned_data.get('price')
        if price and price < 0:
            raise forms.ValidationError("Price cannot be negative")
        return price


class ContactForm(forms.Form):
    name = forms.CharField(max_length=100)
    email = forms.EmailField()
    subject = forms.CharField(max_length=200)
    message = forms.CharField(widget=forms.Textarea)

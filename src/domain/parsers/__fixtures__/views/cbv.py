# Fixture: Class-based views
# Inspired by django-oscar catalogue CBV patterns
from django.views.generic import DetailView, ListView, CreateView
from django.contrib.auth.mixins import LoginRequiredMixin
from .models import Product, Category


class ProductDetailView(DetailView):
    model = Product
    template_name = 'catalogue/product_detail.html'
    context_object_name = 'product'


class CategoryListView(ListView):
    model = Category
    template_name = 'catalogue/category_list.html'
    paginate_by = 20


class ProductCreateView(LoginRequiredMixin, CreateView):
    model = Product
    template_name = 'catalogue/product_form.html'
    fields = ['name', 'price', 'description']

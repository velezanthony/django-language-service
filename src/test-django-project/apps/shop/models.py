import uuid
from django.db import models
from django.contrib.auth.models import User


class Category(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)

    class Meta:
        verbose_name_plural = 'categories'

    def __str__(self):
        return self.name


class Profile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    bio = models.TextField(blank=True, default='')
    location = models.CharField(max_length=200, blank=True, default='')
    website = models.URLField(blank=True, default='')

    @property
    def full_name(self):
        return f"{self.user.first_name} {self.user.last_name}"

    @property
    def display_name(self):
        return self.full_name.strip() or self.user.username

    def __str__(self):
        return self.display_name


class Product(models.Model):
    STATUS_CHOICES = (
        ('draft', 'Draft'),
        ('published', 'Published'),
        ('archived', 'Archived'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=250)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    stock = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='products')
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='products')
    featured_image = models.ImageField(upload_to='products/', null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    @property
    def is_available(self):
        return self.status == 'published' and self.stock > 0

    @property
    def discount_price(self):
        return self.price * 0.9

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['-created']


class Tag(models.Model):
    name = models.CharField(max_length=50, unique=True)
    products = models.ManyToManyField(Product, related_name='tags', blank=True)

    def __str__(self):
        return self.name


class Review(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='reviews')
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reviews')
    rating = models.IntegerField()
    comment = models.TextField(blank=True)
    created = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.author} - {self.product} ({self.rating}/5)"


class Order(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('shipped', 'Shipped'),
        ('delivered', 'Delivered'),
        ('cancelled', 'Cancelled'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='orders')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    shipping_address = models.TextField(blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    @property
    def is_completed(self):
        return self.status == 'delivered'

    def __str__(self):
        return f"Order {self.id} - {self.customer}"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.IntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.product.name} x{self.quantity}"


class Warehouse(models.Model):
    product = models.OneToOneField(Product, on_delete=models.CASCADE, related_name='warehouse')
    location = models.CharField(max_length=200)
    capacity = models.FloatField(default=0)
    last_restocked = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Warehouse: {self.product.name}"


# ── Edge cases for testing django-language-service ──

class TimeStampedModel(models.Model):
    """Abstract base model — fields should be inherited by children."""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Comment(TimeStampedModel):
    """Inherits from abstract model. FK WITHOUT related_name (auto: product.comment_set)."""
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    author = models.ForeignKey(User, on_delete=models.CASCADE)
    text = models.TextField()
    is_approved = models.BooleanField(default=False)

    @property
    def short_text(self):
        return self.text[:100]

    def __str__(self):
        return f"Comment by {self.author} on {self.product}"


class Wishlist(models.Model):
    """M2M WITHOUT related_name (auto: product.wishlist_set)."""
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    products = models.ManyToManyField(Product, blank=True)
    created = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Wishlist of {self.user}"


class Coupon(models.Model):
    """FK with related_name='+' — disables reverse relation entirely."""
    code = models.CharField(max_length=50, unique=True)
    discount = models.DecimalField(max_digits=5, decimal_places=2)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='+')
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.code


class SubCategory(models.Model):
    """Self-referential FK — parent points to itself."""
    name = models.CharField(max_length=100)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='subcategories')

    def __str__(self):
        return self.name


class Supplier(models.Model):
    """FK via string reference instead of direct import."""
    name = models.CharField(max_length=200)
    product = models.ForeignKey('shop.Product', on_delete=models.CASCADE, related_name='suppliers')
    contact_email = models.EmailField()

    def __str__(self):
        return self.name


class ProductImage(models.Model):
    """Multiple FKs to same model with different related_names."""
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='uploaded_images')
    image = models.ImageField(upload_to='product_images/')
    alt_text = models.CharField(max_length=200, blank=True)
    is_primary = models.BooleanField(default=False)

    def __str__(self):
        return f"Image for {self.product.name}"


class SpecialOffer(models.Model):
    """O2O WITHOUT custom related_name (auto: product.specialoffer)."""
    product = models.OneToOneField(Product, on_delete=models.CASCADE)
    discount_percent = models.IntegerField()
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()

    @property
    def is_active(self):
        from django.utils import timezone
        now = timezone.now()
        return self.start_date <= now <= self.end_date

    def __str__(self):
        return f"{self.discount_percent}% off {self.product.name}"

from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth.models import User

from .models import Product, Category, Review, Order, OrderItem, Tag, Profile, Warehouse


class ModelTests(TestCase):
    """Test model creation, relationships, and properties."""

    def setUp(self):
        self.user = User.objects.create_user('testuser', 'test@test.com', 'pass123')
        self.category = Category.objects.create(name='Electronics', slug='electronics')
        self.product = Product.objects.create(
            name='Laptop', slug='laptop', price=999.99, stock=10,
            status='published', category=self.category, author=self.user,
        )

    def test_product_str(self):
        self.assertEqual(str(self.product), 'Laptop')

    def test_product_is_available(self):
        self.assertTrue(self.product.is_available)

    def test_product_not_available_when_draft(self):
        self.product.status = 'draft'
        self.assertFalse(self.product.is_available)

    def test_product_not_available_when_no_stock(self):
        self.product.stock = 0
        self.assertFalse(self.product.is_available)

    def test_product_discount_price(self):
        self.assertAlmostEqual(float(self.product.discount_price), 899.99, places=2)

    def test_category_products_reverse(self):
        """FK reverse: category.products should return related products."""
        self.assertIn(self.product, self.category.products.all())

    def test_user_products_reverse(self):
        """FK reverse: user.products should return authored products."""
        self.assertIn(self.product, self.user.products.all())

    def test_profile_o2o(self):
        """OneToOne: user.profile ↔ profile.user."""
        profile = Profile.objects.create(user=self.user, bio='Test bio')
        self.assertEqual(self.user.profile, profile)
        self.assertEqual(profile.full_name, ' ')  # no first/last name set

    def test_profile_display_name(self):
        profile = Profile.objects.create(user=self.user)
        self.assertEqual(profile.display_name, 'testuser')
        self.user.first_name = 'John'
        self.user.last_name = 'Doe'
        self.user.save()
        self.assertEqual(profile.display_name, 'John Doe')

    def test_warehouse_o2o(self):
        """OneToOne: product.warehouse ↔ warehouse.product."""
        warehouse = Warehouse.objects.create(product=self.product, location='A1', capacity=100)
        self.assertEqual(self.product.warehouse, warehouse)

    def test_tag_m2m(self):
        """ManyToMany: product.tags ↔ tag.products."""
        tag = Tag.objects.create(name='Sale')
        tag.products.add(self.product)
        self.assertIn(tag, self.product.tags.all())
        self.assertIn(self.product, tag.products.all())

    def test_review_fk(self):
        """FK: product.reviews reverse."""
        review = Review.objects.create(
            product=self.product, author=self.user, rating=5, comment='Great!',
        )
        self.assertIn(review, self.product.reviews.all())

    def test_order_with_items(self):
        """Order → OrderItem → Product chain."""
        order = Order.objects.create(customer=self.user, total=999.99)
        item = OrderItem.objects.create(order=order, product=self.product, quantity=1, price=999.99)
        self.assertIn(item, order.items.all())
        self.assertTrue(order.is_completed is False)

    def test_order_is_completed(self):
        order = Order.objects.create(customer=self.user, status='delivered', total=100)
        self.assertTrue(order.is_completed)


class ViewTests(TestCase):
    """Test all views return 200 and use correct templates."""

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user('testuser', 'test@test.com', 'pass123')
        self.category = Category.objects.create(name='Books', slug='books')
        self.product = Product.objects.create(
            name='Django Book', slug='django-book', price=49.99, stock=5,
            status='published', category=self.category, author=self.user,
        )

    def test_home(self):
        response = self.client.get(reverse('home'))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'shop/pages/home.html')
        self.assertTemplateUsed(response, 'base/base.html')
        self.assertIn('featured_products', response.context)
        self.assertIn('site_name', response.context)

    def test_product_list(self):
        response = self.client.get(reverse('product_list'))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'shop/pages/products/product_list.html')
        self.assertIn('products', response.context)
        self.assertIn('categories', response.context)

    def test_product_list_search(self):
        response = self.client.get(reverse('product_list'), {'q': 'django'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context['search_query'], 'django')

    def test_product_list_category_filter(self):
        response = self.client.get(reverse('product_list'), {'category': 'books'})
        self.assertEqual(response.status_code, 200)

    def test_product_detail(self):
        response = self.client.get(reverse('product_detail', kwargs={'slug': 'django-book'}))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'shop/pages/products/product_detail.html')
        self.assertEqual(response.context['product'], self.product)
        self.assertIn('reviews', response.context)
        self.assertIn('tags', response.context)
        self.assertIn('related_products', response.context)

    def test_product_detail_404(self):
        response = self.client.get(reverse('product_detail', kwargs={'slug': 'nonexistent'}))
        self.assertEqual(response.status_code, 404)

    def test_dashboard_requires_login(self):
        response = self.client.get(reverse('dashboard'))
        self.assertEqual(response.status_code, 302)
        self.assertIn('login', response.url)

    def test_dashboard_authenticated(self):
        self.client.login(username='testuser', password='pass123')
        response = self.client.get(reverse('dashboard'))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'shop/pages/dashboard/dashboard.html')
        self.assertIn('chart_labels', response.context)
        self.assertIn('chart_values', response.context)
        self.assertIn('recent_orders', response.context)

    def test_login_page(self):
        response = self.client.get(reverse('login'))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'registration/login.html')


class ContextTests(TestCase):
    """Test context helpers return correct keys per user type."""

    def setUp(self):
        self.client = Client()
        self.regular_user = User.objects.create_user('customer', 'c@t.com', 'pass123')
        self.staff_user = User.objects.create_user('staff', 's@t.com', 'pass123', is_staff=True)
        self.admin_user = User.objects.create_superuser('admin', 'a@t.com', 'pass123')
        self.category = Category.objects.create(name='Test', slug='test')
        Product.objects.create(
            name='P1', slug='p1', price=10, stock=1,
            status='published', category=self.category, author=self.regular_user,
        )

    def test_anonymous_context(self):
        response = self.client.get(reverse('home'))
        self.assertEqual(response.context['user_type'], 'anonymous')
        self.assertIn('site_name', response.context)
        self.assertIn('current_year', response.context)

    def test_customer_context(self):
        self.client.login(username='customer', password='pass123')
        response = self.client.get(reverse('home'))
        self.assertEqual(response.context['user_type'], 'customer')

    def test_staff_context(self):
        self.client.login(username='staff', password='pass123')
        response = self.client.get(reverse('home'))
        self.assertEqual(response.context['user_type'], 'staff')

    def test_admin_context(self):
        self.client.login(username='admin', password='pass123')
        response = self.client.get(reverse('home'))
        self.assertEqual(response.context['user_type'], 'admin')


class TemplateTagTests(TestCase):
    """Test custom template tags and filters."""

    def test_currency_filter(self):
        from apps.shop.templatetags.shop_tags import currency
        self.assertEqual(currency(29.99), '$29.99')
        self.assertEqual(currency(1000), '$1,000.00')
        self.assertEqual(currency('invalid'), 'invalid')

    def test_star_rating_filter(self):
        from apps.shop.templatetags.shop_tags import star_rating
        self.assertEqual(star_rating(5), '★★★★★')
        self.assertEqual(star_rating(3), '★★★☆☆')
        self.assertEqual(star_rating(0), '☆☆☆☆☆')
        self.assertEqual(star_rating('bad'), '☆☆☆☆☆')


class URLTests(TestCase):
    """Test all URL patterns resolve correctly."""

    def test_home_url(self):
        self.assertEqual(reverse('home'), '/')

    def test_product_list_url(self):
        self.assertEqual(reverse('product_list'), '/products/')

    def test_product_detail_url(self):
        self.assertEqual(reverse('product_detail', kwargs={'slug': 'test'}), '/products/test/')

    def test_dashboard_url(self):
        self.assertEqual(reverse('dashboard'), '/dashboard/')

    def test_login_url(self):
        self.assertEqual(reverse('login'), '/login/')

    def test_logout_url(self):
        self.assertEqual(reverse('logout'), '/logout/')

    def test_profile_url(self):
        self.assertEqual(reverse('profile'), '/profile/')

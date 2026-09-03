# Fixture: Models with inline choices, TextChoices, and module-level constants
# Inspired by django-oscar order models
from django.db import models

# Module-level choices constant
STATUS_CHOICES = [
    ('pending', 'Pending'),
    ('processing', 'Processing'),
    ('shipped', 'Shipped'),
    ('delivered', 'Delivered'),
    ('cancelled', 'Cancelled'),
]


class Order(models.Model):

    class PaymentStatus(models.TextChoices):
        UNPAID = 'unpaid', 'Unpaid'
        PAID = 'paid', 'Paid'
        REFUNDED = 'refunded', 'Refunded'

    # Inline choices literal
    priority = models.IntegerField(
        choices=[(1, 'Low'), (2, 'Medium'), (3, 'High')],
        default=1,
    )
    # Nested TextChoices reference
    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
    )
    # Module-level constant reference
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

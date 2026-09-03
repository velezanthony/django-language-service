"""Auto-generated models for app `billing` — stress-testing the diagram tool.

Total models in this app: 20.
Regenerate via `python scripts/generate_test_models.py`.
"""
from django.db import models

class Currency(models.Model):
    """Auto-generated billing.Currency for diagram stress testing."""
    code = models.CharField(max_length=200)
    symbol = models.CharField(max_length=200)

    def __str__(self):
        return str(self.code)

class ExchangeRate(models.Model):
    """Auto-generated billing.ExchangeRate for diagram stress testing."""
    rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    recorded_at = models.DateTimeField(auto_now_add=True)
    base = models.ForeignKey(Currency, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    quote = models.ForeignKey(Currency, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.rate)

class TaxRate(models.Model):
    """Auto-generated billing.TaxRate for diagram stress testing."""
    name = models.CharField(max_length=200)
    percent = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    def __str__(self):
        return str(self.name)

class Plan(models.Model):
    """Auto-generated billing.Plan for diagram stress testing."""
    name = models.CharField(max_length=200)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    interval = models.CharField(max_length=200)
    currency = models.ForeignKey(Currency, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class Feature(models.Model):
    """Auto-generated billing.Feature for diagram stress testing."""
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    def __str__(self):
        return str(self.name)

class PlanFeature(models.Model):
    """Auto-generated billing.PlanFeature for diagram stress testing."""
    quota = models.IntegerField(default=0)
    plan = models.ForeignKey(Plan, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    feature = models.ForeignKey(Feature, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.quota)

class Subscription(models.Model):
    """Auto-generated billing.Subscription for diagram stress testing."""
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=200)
    plan = models.ForeignKey(Plan, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    account = models.ForeignKey('crm.Account', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.started_at)

class Invoice(models.Model):
    """Auto-generated billing.Invoice for diagram stress testing."""
    number = models.CharField(max_length=200)
    issued_at = models.DateField(null=True, blank=True)
    due_at = models.DateField(null=True, blank=True)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    account = models.ForeignKey('crm.Account', on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    currency = models.ForeignKey(Currency, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    tax_rate = models.ForeignKey(TaxRate, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.number)

class InvoiceLine(models.Model):
    """Auto-generated billing.InvoiceLine for diagram stress testing."""
    description = models.CharField(max_length=200)
    quantity = models.IntegerField(default=0)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.description)

class PaymentProvider(models.Model):
    """Auto-generated billing.PaymentProvider for diagram stress testing."""
    name = models.CharField(max_length=200)
    config = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return str(self.name)

class PaymentMethod(models.Model):
    """Auto-generated billing.PaymentMethod for diagram stress testing."""
    label = models.CharField(max_length=200)
    last4 = models.CharField(max_length=200)
    brand = models.CharField(max_length=200)
    account = models.ForeignKey('crm.Account', on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    provider = models.ForeignKey(PaymentProvider, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.label)

class Payment(models.Model):
    """Auto-generated billing.Payment for diagram stress testing."""
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    paid_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=200)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    method = models.ForeignKey(PaymentMethod, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.amount)

class Refund(models.Model):
    """Auto-generated billing.Refund for diagram stress testing."""
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    refunded_at = models.DateTimeField(auto_now_add=True)
    reason = models.CharField(max_length=200)
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.amount)

class CreditNote(models.Model):
    """Auto-generated billing.CreditNote for diagram stress testing."""
    number = models.CharField(max_length=200)
    issued_at = models.DateField(null=True, blank=True)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.number)

class Coupon(models.Model):
    """Auto-generated billing.Coupon for diagram stress testing."""
    code = models.CharField(max_length=200)
    percent_off = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    valid_until = models.DateField(null=True, blank=True)

    def __str__(self):
        return str(self.code)

class CouponRedemption(models.Model):
    """Auto-generated billing.CouponRedemption for diagram stress testing."""
    redeemed_at = models.DateTimeField(auto_now_add=True)
    coupon = models.ForeignKey(Coupon, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.redeemed_at)

class WebhookEvent(models.Model):
    """Auto-generated billing.WebhookEvent for diagram stress testing."""
    event_type = models.CharField(max_length=200)
    payload = models.JSONField(default=dict, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)
    provider = models.ForeignKey(PaymentProvider, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.event_type)

class Transaction(models.Model):
    """Auto-generated billing.Transaction for diagram stress testing."""
    reference = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    occurred_at = models.DateTimeField(auto_now_add=True)
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.reference)

class DunningSchedule(models.Model):
    """Auto-generated billing.DunningSchedule for diagram stress testing."""
    name = models.CharField(max_length=200)
    days_after_due = models.IntegerField(default=0)

    def __str__(self):
        return str(self.name)

class DunningAttempt(models.Model):
    """Auto-generated billing.DunningAttempt for diagram stress testing."""
    attempted_at = models.DateTimeField(auto_now_add=True)
    succeeded = models.BooleanField(default=False)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    schedule = models.ForeignKey(DunningSchedule, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.attempted_at)

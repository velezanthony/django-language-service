"""Auto-generated models for app `inventory` — stress-testing the diagram tool.

Total models in this app: 20.
Regenerate via `python scripts/generate_test_models.py`.
"""
from django.db import models
from django.utils.translation import gettext_lazy as _

# Cross-file choices fixtures — imported from a sibling module. See enums.py for the
# definitions. v4 walks the imports and turns these refs blue.
from .enums import StockStatus, WAREHOUSE_TYPES, LISTING_STATE


class Warehouse(models.Model):
    """Auto-generated inventory.Warehouse for diagram stress testing."""
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=200)
    # CHOICES SCENARIO 7 — module-level constant defined in a SIBLING file.
    # Should render amber until v4.
    warehouse_type = models.CharField(max_length=20, choices=WAREHOUSE_TYPES, default='main')
    # CHOICES SCENARIO 9 — module-level constant in sibling file WITH gettext_lazy
    # labels (`_('Hidden')` etc.) — exercises cross-file resolution + i18n.
    listing_state = models.CharField(max_length=20, choices=LISTING_STATE, default='hidden')
    address = models.TextField(blank=True)

    def __str__(self):
        return str(self.name)

class Location(models.Model):
    """Auto-generated inventory.Location for diagram stress testing."""
    aisle = models.CharField(max_length=200)
    rack = models.CharField(max_length=200)
    bin = models.CharField(max_length=200)
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.aisle)

class Supplier(models.Model):
    """Auto-generated inventory.Supplier for diagram stress testing."""
    name = models.CharField(max_length=200)
    tax_id = models.CharField(max_length=200)

    def __str__(self):
        return str(self.name)

class SupplierContact(models.Model):
    """Auto-generated inventory.SupplierContact for diagram stress testing."""
    name = models.CharField(max_length=200)
    email = models.EmailField(max_length=254)
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class PurchaseOrder(models.Model):
    """Auto-generated inventory.PurchaseOrder for diagram stress testing."""
    number = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=200)
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.number)

class PurchaseOrderLine(models.Model):
    """Auto-generated inventory.PurchaseOrderLine for diagram stress testing."""
    quantity = models.IntegerField(default=0)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    po = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    product = models.ForeignKey('shop.Product', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.quantity)

class StockLevel(models.Model):
    """Auto-generated inventory.StockLevel for diagram stress testing."""
    # CHOICES SCENARIO 10 — NESTED TextChoices class INSIDE the model body, with
    # gettext_lazy labels. Common Django pattern: scope an enum to a single model.
    # Should resolve via classConstantsIndex (the nested-textchoices merger).
    class StockGrade(models.TextChoices):
        A_PRIME = 'a_prime', _('A-Prime')
        STANDARD = 'standard', _('Standard')
        DAMAGED = 'damaged', _('Damaged')
        EXPIRED = 'expired', _('Expired')

    quantity = models.IntegerField(default=0)
    # CHOICES SCENARIO 8 — TextChoices class defined in a SIBLING file (.enums).
    # Should render amber until v4. After v4: blue chip with head 'Allowed values · StockStatus'.
    status = models.CharField(max_length=20, choices=StockStatus.choices, default='in_stock')
    grade = models.CharField(max_length=20, choices=StockGrade.choices, default='standard')
    product = models.ForeignKey('shop.Product', on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.quantity)

class StockMovement(models.Model):
    """Auto-generated inventory.StockMovement for diagram stress testing."""
    quantity = models.IntegerField(default=0)
    movement_type = models.CharField(max_length=200)
    occurred_at = models.DateTimeField(auto_now_add=True)
    stock_level = models.ForeignKey(StockLevel, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.quantity)

class Transfer(models.Model):
    """Auto-generated inventory.Transfer for diagram stress testing."""
    reference = models.CharField(max_length=200)
    status = models.CharField(max_length=200)
    origin = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    destination = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.reference)

class TransferLine(models.Model):
    """Auto-generated inventory.TransferLine for diagram stress testing."""
    quantity = models.IntegerField(default=0)
    transfer = models.ForeignKey(Transfer, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    product = models.ForeignKey('shop.Product', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.quantity)

class Lot(models.Model):
    """Auto-generated inventory.Lot for diagram stress testing."""
    code = models.CharField(max_length=200)
    expires_on = models.DateField(null=True, blank=True)
    product = models.ForeignKey('shop.Product', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.code)

class SerialNumber(models.Model):
    """Auto-generated inventory.SerialNumber for diagram stress testing."""
    value = models.CharField(max_length=200)
    lot = models.ForeignKey(Lot, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.value)

class Carrier(models.Model):
    """Auto-generated inventory.Carrier for diagram stress testing."""
    name = models.CharField(max_length=200)
    tracking_url = models.URLField(blank=True)

    def __str__(self):
        return str(self.name)

class Shipment(models.Model):
    """Auto-generated inventory.Shipment for diagram stress testing."""
    tracking_code = models.CharField(max_length=200)
    shipped_at = models.DateField(null=True, blank=True)
    carrier = models.ForeignKey(Carrier, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    po = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.tracking_code)

class ShipmentLine(models.Model):
    """Auto-generated inventory.ShipmentLine for diagram stress testing."""
    quantity = models.IntegerField(default=0)
    shipment = models.ForeignKey(Shipment, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    po_line = models.ForeignKey(PurchaseOrderLine, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.quantity)

class StockAdjustment(models.Model):
    """Auto-generated inventory.StockAdjustment for diagram stress testing."""
    quantity_delta = models.IntegerField(default=0)
    reason = models.CharField(max_length=200)
    adjusted_at = models.DateTimeField(auto_now_add=True)
    stock_level = models.ForeignKey(StockLevel, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.quantity_delta)

class StockReservation(models.Model):
    """Auto-generated inventory.StockReservation for diagram stress testing."""
    quantity = models.IntegerField(default=0)
    reserved_until = models.DateTimeField(auto_now_add=True)
    stock_level = models.ForeignKey(StockLevel, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.quantity)

class Stocktake(models.Model):
    """Auto-generated inventory.Stocktake for diagram stress testing."""
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateField(null=True, blank=True)
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.started_at)

class StocktakeLine(models.Model):
    """Auto-generated inventory.StocktakeLine for diagram stress testing."""
    counted_quantity = models.IntegerField(default=0)
    system_quantity = models.IntegerField(default=0)
    stocktake = models.ForeignKey(Stocktake, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    product = models.ForeignKey('shop.Product', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.counted_quantity)

class Manifest(models.Model):
    """Auto-generated inventory.Manifest for diagram stress testing."""
    reference = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
    shipment = models.OneToOneField(Shipment, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.reference)

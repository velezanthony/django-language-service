"""Auto-generated initial migration for `inventory`."""
import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
        ('contenttypes', '0002_remove_content_type_name'),
        ('shop', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Warehouse',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('code', models.CharField(max_length=200)),
                ('address', models.TextField(blank=True)),
            ],
        ),
        migrations.CreateModel(
            name='Location',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('aisle', models.CharField(max_length=200)),
                ('rack', models.CharField(max_length=200)),
                ('bin', models.CharField(max_length=200)),
                ('warehouse', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.warehouse')),
            ],
        ),
        migrations.CreateModel(
            name='Supplier',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('tax_id', models.CharField(max_length=200)),
            ],
        ),
        migrations.CreateModel(
            name='SupplierContact',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('email', models.EmailField(max_length=254)),
                ('supplier', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.supplier')),
            ],
        ),
        migrations.CreateModel(
            name='PurchaseOrder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('number', models.CharField(max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('status', models.CharField(max_length=200)),
                ('supplier', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.supplier')),
            ],
        ),
        migrations.CreateModel(
            name='PurchaseOrderLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.IntegerField(default=0)),
                ('unit_price', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('po', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.purchaseorder')),
                ('product', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='shop.product')),
            ],
        ),
        migrations.CreateModel(
            name='StockLevel',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.IntegerField(default=0)),
                ('product', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='shop.product')),
                ('location', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.location')),
            ],
        ),
        migrations.CreateModel(
            name='StockMovement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.IntegerField(default=0)),
                ('movement_type', models.CharField(max_length=200)),
                ('occurred_at', models.DateTimeField(auto_now_add=True)),
                ('stock_level', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.stocklevel')),
            ],
        ),
        migrations.CreateModel(
            name='Transfer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reference', models.CharField(max_length=200)),
                ('status', models.CharField(max_length=200)),
                ('origin', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.warehouse')),
                ('destination', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.warehouse')),
            ],
        ),
        migrations.CreateModel(
            name='TransferLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.IntegerField(default=0)),
                ('transfer', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.transfer')),
                ('product', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='shop.product')),
            ],
        ),
        migrations.CreateModel(
            name='Lot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=200)),
                ('expires_on', models.DateField(null=True, blank=True)),
                ('product', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='shop.product')),
            ],
        ),
        migrations.CreateModel(
            name='SerialNumber',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('value', models.CharField(max_length=200)),
                ('lot', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.lot')),
            ],
        ),
        migrations.CreateModel(
            name='Carrier',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('tracking_url', models.URLField(blank=True)),
            ],
        ),
        migrations.CreateModel(
            name='Shipment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tracking_code', models.CharField(max_length=200)),
                ('shipped_at', models.DateField(null=True, blank=True)),
                ('carrier', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.carrier')),
                ('po', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.purchaseorder')),
            ],
        ),
        migrations.CreateModel(
            name='ShipmentLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.IntegerField(default=0)),
                ('shipment', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.shipment')),
                ('po_line', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.purchaseorderline')),
            ],
        ),
        migrations.CreateModel(
            name='StockAdjustment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity_delta', models.IntegerField(default=0)),
                ('reason', models.CharField(max_length=200)),
                ('adjusted_at', models.DateTimeField(auto_now_add=True)),
                ('stock_level', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.stocklevel')),
            ],
        ),
        migrations.CreateModel(
            name='StockReservation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.IntegerField(default=0)),
                ('reserved_until', models.DateTimeField(auto_now_add=True)),
                ('stock_level', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.stocklevel')),
            ],
        ),
        migrations.CreateModel(
            name='Stocktake',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('started_at', models.DateTimeField(auto_now_add=True)),
                ('finished_at', models.DateField(null=True, blank=True)),
                ('warehouse', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.warehouse')),
            ],
        ),
        migrations.CreateModel(
            name='StocktakeLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('counted_quantity', models.IntegerField(default=0)),
                ('system_quantity', models.IntegerField(default=0)),
                ('stocktake', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.stocktake')),
                ('product', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='shop.product')),
            ],
        ),
        migrations.CreateModel(
            name='Manifest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reference', models.CharField(max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('shipment', models.OneToOneField(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='inventory.shipment')),
            ],
        ),
    ]

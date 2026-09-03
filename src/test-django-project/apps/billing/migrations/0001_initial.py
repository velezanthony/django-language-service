"""Auto-generated initial migration for `billing`."""
import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
        ('contenttypes', '0002_remove_content_type_name'),
        ('crm', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Currency',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=200)),
                ('symbol', models.CharField(max_length=200)),
            ],
        ),
        migrations.CreateModel(
            name='ExchangeRate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rate', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('recorded_at', models.DateTimeField(auto_now_add=True)),
                ('base', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.currency')),
                ('quote', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.currency')),
            ],
        ),
        migrations.CreateModel(
            name='TaxRate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('percent', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
            ],
        ),
        migrations.CreateModel(
            name='Plan',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('price', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('interval', models.CharField(max_length=200)),
                ('currency', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.currency')),
            ],
        ),
        migrations.CreateModel(
            name='Feature',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
            ],
        ),
        migrations.CreateModel(
            name='PlanFeature',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quota', models.IntegerField(default=0)),
                ('plan', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.plan')),
                ('feature', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.feature')),
            ],
        ),
        migrations.CreateModel(
            name='Subscription',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('started_at', models.DateTimeField(auto_now_add=True)),
                ('ended_at', models.DateField(null=True, blank=True)),
                ('status', models.CharField(max_length=200)),
                ('plan', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.plan')),
                ('account', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.account')),
            ],
        ),
        migrations.CreateModel(
            name='Invoice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('number', models.CharField(max_length=200)),
                ('issued_at', models.DateField(null=True, blank=True)),
                ('due_at', models.DateField(null=True, blank=True)),
                ('total', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('account', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.account')),
                ('currency', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.currency')),
                ('tax_rate', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.taxrate')),
            ],
        ),
        migrations.CreateModel(
            name='InvoiceLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('description', models.CharField(max_length=200)),
                ('quantity', models.IntegerField(default=0)),
                ('unit_price', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('invoice', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.invoice')),
            ],
        ),
        migrations.CreateModel(
            name='PaymentProvider',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('config', models.JSONField(blank=True, default=dict)),
            ],
        ),
        migrations.CreateModel(
            name='PaymentMethod',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('label', models.CharField(max_length=200)),
                ('last4', models.CharField(max_length=200)),
                ('brand', models.CharField(max_length=200)),
                ('account', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.account')),
                ('provider', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.paymentprovider')),
            ],
        ),
        migrations.CreateModel(
            name='Payment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('paid_at', models.DateTimeField(auto_now_add=True)),
                ('status', models.CharField(max_length=200)),
                ('invoice', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.invoice')),
                ('method', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.paymentmethod')),
            ],
        ),
        migrations.CreateModel(
            name='Refund',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('refunded_at', models.DateTimeField(auto_now_add=True)),
                ('reason', models.CharField(max_length=200)),
                ('payment', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.payment')),
            ],
        ),
        migrations.CreateModel(
            name='CreditNote',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('number', models.CharField(max_length=200)),
                ('issued_at', models.DateField(null=True, blank=True)),
                ('total', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('invoice', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.invoice')),
            ],
        ),
        migrations.CreateModel(
            name='Coupon',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=200)),
                ('percent_off', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('valid_until', models.DateField(null=True, blank=True)),
            ],
        ),
        migrations.CreateModel(
            name='CouponRedemption',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('redeemed_at', models.DateTimeField(auto_now_add=True)),
                ('coupon', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.coupon')),
                ('invoice', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.invoice')),
            ],
        ),
        migrations.CreateModel(
            name='WebhookEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(max_length=200)),
                ('payload', models.JSONField(blank=True, default=dict)),
                ('received_at', models.DateTimeField(auto_now_add=True)),
                ('provider', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.paymentprovider')),
            ],
        ),
        migrations.CreateModel(
            name='Transaction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reference', models.CharField(max_length=200)),
                ('amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('occurred_at', models.DateTimeField(auto_now_add=True)),
                ('payment', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.payment')),
            ],
        ),
        migrations.CreateModel(
            name='DunningSchedule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('days_after_due', models.IntegerField(default=0)),
            ],
        ),
        migrations.CreateModel(
            name='DunningAttempt',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('attempted_at', models.DateTimeField(auto_now_add=True)),
                ('succeeded', models.BooleanField(default=False)),
                ('invoice', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.invoice')),
                ('schedule', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='billing.dunningschedule')),
            ],
        ),
    ]

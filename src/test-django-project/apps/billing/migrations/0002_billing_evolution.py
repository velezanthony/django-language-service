"""Evolution migration 0002_billing_evolution for `billing`."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('billing', '0001_initial'),
        ('crm', '0003_crm_renames'),
    ]

    operations = [
        migrations.AddField(
            model_name='invoice',
            name='reference',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='payment',
            name='gateway_id',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AlterField(
            model_name='invoice',
            name='total',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.AddIndex(
            model_name='invoice',
            index=models.Index(fields=['issued_at'], name='billing_invoice_issued_idx'),
        ),
    ]

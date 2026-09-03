"""Evolution migration 0003_billing_cleanup for `billing`."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('billing', '0002_billing_evolution'),
    ]

    operations = [
        migrations.RenameField(
            model_name='payment',
            old_name='paid_at',
            new_name='processed_at',
        ),
        migrations.RemoveField(
            model_name='coupon',
            name='percent_off',
        ),
        migrations.AddField(
            model_name='coupon',
            name='amount_off',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
    ]

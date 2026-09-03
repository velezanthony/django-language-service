"""Evolution migration 0002_hr_fields for `hr`."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('hr', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='employee',
            name='phone',
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name='employee',
            name='birth_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='contract',
            name='salary',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.RenameField(
            model_name='leaverequest',
            old_name='status',
            new_name='approval_status',
        ),
    ]

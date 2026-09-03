# Fixture: Alter migration — AddField + AlterField + RenameField
# Inspired by django-oscar stock migration patterns
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalogue', '0001_initial'),
        ('core', '0002_add_timestamps'),
    ]

    operations = [
        migrations.AddField(
            model_name='Product',
            name='description',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AlterField(
            model_name='Product',
            name='price',
            field=models.DecimalField(max_digits=12, decimal_places=2),
        ),
        migrations.RenameField(
            model_name='Category',
            old_name='slug',
            new_name='url_slug',
        ),
    ]

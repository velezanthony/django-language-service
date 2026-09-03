"""Evolution migration 0002_crm_fields for `crm`."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('crm', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='deal',
            name='probability',
            field=models.FloatField(default=0.5),
        ),
        migrations.AddField(
            model_name='contact',
            name='timezone',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AlterField(
            model_name='lead',
            name='email',
            field=models.EmailField(max_length=320),
        ),
    ]

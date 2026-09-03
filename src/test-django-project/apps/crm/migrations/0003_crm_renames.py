"""Evolution migration 0003_crm_renames for `crm`."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('crm', '0002_crm_fields'),
    ]

    operations = [
        migrations.RenameField(
            model_name='lead',
            old_name='score',
            new_name='lead_score',
        ),
        migrations.RenameModel(
            old_name='DealStage',
            new_name='PipelineStage',
        ),
        migrations.RemoveField(
            model_name='note',
            name='account',
        ),
    ]

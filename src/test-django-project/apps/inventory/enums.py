"""Cross-file choices fixtures for the diagram tool's v4 (cross-file resolver) target.

The two patterns below are the realistic ways Django projects split choices off into a
separate module when they're shared across multiple models or simply too noisy to live
inline in models.py. v1-v3 leave references to symbols defined here as kind='unresolved'
(amber chip in the UI); v4 walks the imports and flips them to kind='resolved' (blue chip).
"""
from django.db import models
from django.utils.translation import gettext_lazy as _


# Pattern A — TextChoices class in a different module than its consumer.
# Imported as `from .enums import StockStatus` in models.py.
class StockStatus(models.TextChoices):
    IN_STOCK = 'in_stock', 'In Stock'
    LOW = 'low', 'Low Stock'
    OUT = 'out', 'Out of Stock'
    BACKORDER = 'backorder', 'Backorder'


# Pattern B — module-level constant in a different module than its consumer.
# Imported as `from .enums import WAREHOUSE_TYPES` in models.py.
WAREHOUSE_TYPES = [
    ('main', 'Main Warehouse'),
    ('satellite', 'Satellite'),
    ('thirdparty', 'Third-Party Logistics'),
    ('virtual', 'Virtual / Dropship'),
]


# Pattern C — module-level constant where the LABELS are wrapped in gettext_lazy `_()`
# for i18n. This is the canonical Django pattern in real apps. The parser extracts the
# source-language label (the developer's reference language) and the chip resolves like
# any other cross-file constant.
LISTING_STATE = (
    ('hidden', _('Hidden')),
    ('pending', _('Pending review')),
    ('active', _('Active')),
)

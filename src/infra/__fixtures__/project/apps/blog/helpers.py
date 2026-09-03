from django import template

register = template.Library()


@register.simple_tag
def post_count(status='published'):
    """Return the number of posts with a given status."""
    from .models import Post
    return Post.objects.filter(status=status).count()

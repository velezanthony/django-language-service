from django.shortcuts import render, get_object_or_404
from django.views.generic import ListView
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Q

from apps.core.context import get_base_context
from .models import Post, Author, Category, Tag, Comment


# ── Post list (FBV) ──

def post_list(request):
    template_name = 'blog/pages/post_list.html'
    context = get_base_context(request)

    posts_qs = (
        Post.objects
        .filter(status='published')
        .select_related('author', 'category')
        .annotate(comment_count=Count('comments'))
        .order_by('-created')
    )

    search = request.GET.get('q')
    if search:
        posts_qs = posts_qs.filter(Q(title__icontains=search) | Q(body__icontains=search))

    context.update({
        'posts': posts_qs[:20],
        'categories': Category.objects.all(),
        'featured_tags': Tag.objects.all()[:10],
        'total_posts': posts_qs.count(),
    })

    return render(request, template_name, context)


# ── Post detail (FBV) ──

def post_detail(request, slug):
    template_name = 'blog/pages/post_detail.html'
    post = get_object_or_404(Post, slug=slug)
    context = get_base_context(request)

    context.update({
        'post': post,
        'author': post.author,
        'related_posts': Post.objects.filter(category=post.category).exclude(pk=post.pk)[:4],
        'comments': post.comments.select_related('author').order_by('-created'),
        'comment_count': post.comments.count(),
    })

    return render(request, template_name, context)


# ── Author profile (FBV) ──

@login_required
def author_profile(request, author_id):
    template_name = 'blog/pages/author_profile.html'
    author = get_object_or_404(Author, pk=author_id)
    context = get_base_context(request)

    context.update({
        'author': author,
        'author_posts': Post.objects.filter(author=author).order_by('-created'),
        'post_total': Post.objects.filter(author=author).count(),
    })

    return render(request, template_name, context)


# ── Tag archive (CBV) ──

class TagArchiveView(ListView):
    template_name = 'blog/pages/tag_archive.html'
    context_object_name = 'posts'
    paginate_by = 12

    def get_queryset(self):
        return Post.objects.filter(tags__slug=self.kwargs['slug']).order_by('-created')

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.update(get_base_context(self.request))
        context['tag_slug'] = self.kwargs['slug']
        return context

from django.shortcuts import render, get_object_or_404

from .models import Post


def list_posts(request):
    """Display all published posts."""
    posts = Post.objects.filter(status='published')
    return render(request, 'blog/list.html', {'posts': posts})


def post_detail(request, pk):
    """Display a single post."""
    post = get_object_or_404(Post, pk=pk, status='published')
    return render(request, 'blog/detail.html', {'post': post})

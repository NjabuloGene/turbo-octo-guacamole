from django.db import models
from django.contrib.auth.models import User
from django.conf import settings

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    full_name = models.CharField(max_length=100)
    job_title = models.CharField(max_length=100, blank=True)  # e.g., "Nanny"
    experience_months = models.IntegerField(default=0)
    hourly_rate = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    location = models.CharField(max_length=200, blank=True)
    profile_image = models.ImageField(upload_to='profiles/', blank=True, null=True)
    rating = models.FloatField(default=0.0)
    interview_completed = models.BooleanField(default=False)  # Flag for optional interview

    def __str__(self):
        return self.full_name or self.user.username

class Interview(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='interviews')
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, null=True, blank=True, related_name='interviews')
    started_at = models.DateTimeField(auto_now_add=True)
    completed = models.BooleanField(default=False)

    class Meta:
        # We'll store this in second_db (via database router or manual using)
        # If you prefer manual using, just don't set a Meta option.
        pass

class InterviewMessage(models.Model):
    interview = models.ForeignKey(Interview, on_delete=models.CASCADE, related_name='messages')
    speaker = models.CharField(max_length=10)  # 'user' or 'ai'
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['timestamp']
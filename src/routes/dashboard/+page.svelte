<script lang="ts">
  import { Button, Badge, Card, CardHeader, CardTitle, CardContent } from '@beeblock/svelar/ui';

  let { data } = $props();
</script>

<svelte:head>
  <title>Dashboard</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h1 class="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
    <p class="text-muted-foreground">Welcome back, {data.user.name}</p>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <Card>
      <CardContent class="pt-6">
        <p class="text-sm text-muted-foreground">API Keys</p>
        <p class="text-3xl font-bold text-brand mt-2">{data.stats.apiKeyCount}</p>
        <a href="/dashboard/api-keys" class="text-sm text-brand hover:underline mt-2 inline-block">Manage keys</a>
      </CardContent>
    </Card>

    <Card>
      <CardContent class="pt-6">
        <p class="text-sm text-muted-foreground">Teams</p>
        <p class="text-3xl font-bold text-brand mt-2">{data.stats.teamCount}</p>
        <a href="/dashboard/team" class="text-sm text-brand hover:underline mt-2 inline-block">Manage team</a>
      </CardContent>
    </Card>

    <Card>
      <CardContent class="pt-6">
        <p class="text-sm text-muted-foreground">Account</p>
        <Badge variant="default" class="mt-2">{data.user.role}</Badge>
      </CardContent>
    </Card>
  </div>

  <Card>
    <CardHeader>
      <CardTitle>Quick Actions</CardTitle>
    </CardHeader>
    <CardContent class="flex flex-wrap gap-3">
      <a href="/dashboard/api-keys"><Button variant="outline">Create API Key</Button></a>
      <a href="/dashboard/team"><Button variant="outline">Invite Team Member</Button></a>
      {#if data.user.role === 'admin'}
        <a href="/admin"><Button variant="outline">Admin Panel</Button></a>
      {/if}
    </CardContent>
  </Card>
</div>

<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import type { DisplayUserToAdmin } from '~~/types/auth'

const props = defineProps<{
  users: DisplayUserToAdmin[] | undefined
  loading: boolean
}>()

const columns: ColumnDef<DisplayUserToAdmin>[] = [
    {
      header: 'First Name',
      accessorKey: 'googleGivenName',
    },
    {
      header: 'Last Name',
      accessorKey: 'googleFamilyName',
    },
    {
      header: 'Created',
      accessorKey: 'createdAt',
    },
    {
      header: 'Last Seen',
      accessorKey: 'lastSeenAt',
    },
    {
      header: 'Allow Login',
      accessorKey: 'allowLogin',
    },
    {
      header: 'Is Retired',
      accessorKey: 'isRetired',
    },
    {
      header: 'Is Admin',
      accessorKey: 'isAdmin',
    },
  ]
  
  const expanded = ref<Record<string, boolean>>({})
  </script>
  
  <template>
    <NTable
      v-model:expanded="expanded"
      :loading="loading"
      :columns="columns"
      :data="users || []"
    >
      <template #expanded="{ row }">
        <div class="p-4">
          <p class="text-sm text-muted">
            Object:
          </p>
          <p class="text-base">
            {{ row }}
          </p>
        </div>
      </template>
    </NTable>
  </template>
  
  
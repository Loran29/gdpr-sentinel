"""Microsoft Graph connector — STUB.

This is intentionally a stub. Real Graph access requires:
  - An Azure AD app registration with `Files.Read.All`, `Sites.Read.All`,
    and `User.Read.All` application permissions (admin-consented).
  - A confidential client (client_id + tenant_id + client_secret OR certificate).
  - The `msgraph-sdk` Python package (or `msal` + raw HTTP).

The shapes below show exactly which Graph SDK calls would replace the stubs, so
swapping in a real implementation is mechanical.
"""

from __future__ import annotations

from connectors.base import Connector, FileMeta


class GraphConnector(Connector):
    def __init__(self, tenant_id: str, client_id: str, client_secret: str) -> None:
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        # In a real impl:
        #   from azure.identity import ClientSecretCredential
        #   from msgraph import GraphServiceClient
        #   credential = ClientSecretCredential(tenant_id, client_id, client_secret)
        #   self.client = GraphServiceClient(credential, scopes=["https://graph.microsoft.com/.default"])

    def list_files(self) -> list[FileMeta]:
        """Walk every user's OneDrive root.

        Real implementation:
            users = await self.client.users.get()
            for user in users.value:
                drive = await self.client.users.by_user_id(user.id).drive.get()
                children = await self.client.users.by_user_id(user.id).drive.root.children.get()
                # recurse via children[i].folder is not None
        """
        raise NotImplementedError("Requires Azure AD app registration — see docstring")

    def read_file(self, path: str) -> bytes:
        """Download a single file's bytes.

        Real implementation:
            content = await self.client.users.by_user_id(user_id).drive.items.by_drive_item_id(item_id).content.get()
            return content
        """
        raise NotImplementedError("Requires Azure AD app registration — see docstring")

    def get_owner(self, path: str) -> str | None:
        """Resolve the Graph user id that owns the drive containing `path`.

        Real implementation:
            # Items returned by list_files include the parent driveId; map driveId
            # back to the user via /drives/{driveId}/owner.
            owner = await self.client.drives.by_drive_id(drive_id).owner.get()
            return owner.user.id
        """
        raise NotImplementedError("Requires Azure AD app registration — see docstring")

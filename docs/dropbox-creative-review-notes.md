# Dropbox creative-review delivery note

For a Dropbox shared-folder link, the `sharing/get_shared_link_file` API must receive the file path **relative to the shared-link root**. The Vektiss stream resolver therefore attempts the cached path and then the filename-relative alternatives without exposing the Dropbox link or account credential to the browser.

Source consulted: <https://community.dropbox.com/en/discussion/comment/416358>

# New Client Setup

To start a project for a new client:

1. Create a brand kit directory:
   ```bash
   mkdir -p brands/<client-slug>
   cp brands/_template/brand-kit.md brands/<client-slug>/brand-kit.md
   ```

2. Edit `brands/<client-slug>/brand-kit.md` with the client's details.

3. Create the output directory:
   ```bash
   mkdir -p output/<client-slug>/<project-slug>/research
   mkdir -p output/<client-slug>/<project-slug>/specs
   mkdir -p output/<client-slug>/<project-slug>/qa
   ```

4. Start your AI agent session and point it at this kit directory.

5. Run the clone skill: `/clone-website <target-url>`

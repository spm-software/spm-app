param(
  [string]$Source = "C:\Users\Usuario\Documents\Codex\APP_RP_PCM\cultos.mdb",
  [string]$Destination = "C:\Users\Usuario\Documents\Codex\APP_RP_PCM\cultos-export.json"
)

$ErrorActionPreference = "Stop"
$connection = New-Object System.Data.OleDb.OleDbConnection(
  "Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$Source;Mode=Read;"
)

try {
  $connection.Open()
  $command = $connection.CreateCommand()
  $command.CommandText = "SELECT [Número], [Tipo], [Pasaje], [Tema], [Ciudad], [Iglesia], [Pais], [Fecha], [Disco] FROM [Cultos tabla]"
  $reader = $command.ExecuteReader()
  $records = @()
  $rowNumber = 0

  while ($reader.Read()) {
    $rowNumber++
    $fecha = if ($reader.IsDBNull(7)) { $null } else { ([datetime]$reader.GetValue(7)).ToString("o") }
    $records += [PSCustomObject]@{
      source_row_number = $rowNumber
      numero = if ($reader.IsDBNull(0)) { 0 } else { [int]$reader.GetValue(0) }
      tipo = if ($reader.IsDBNull(1)) { "" } else { [string]$reader.GetValue(1) }
      pasaje = if ($reader.IsDBNull(2)) { "" } else { [string]$reader.GetValue(2) }
      tema = if ($reader.IsDBNull(3)) { "" } else { [string]$reader.GetValue(3) }
      ciudad = if ($reader.IsDBNull(4)) { "" } else { [string]$reader.GetValue(4) }
      iglesia = if ($reader.IsDBNull(5)) { "" } else { [string]$reader.GetValue(5) }
      pais = if ($reader.IsDBNull(6)) { "" } else { [string]$reader.GetValue(6) }
      fecha = $fecha
      disco = if ($reader.IsDBNull(8)) { "" } else { [string]$reader.GetValue(8) }
    }
  }

  $payload = [PSCustomObject]@{
    source_filename = [IO.Path]::GetFileName($Source)
    records = $records
  }
  $json = $payload | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText($Destination, $json, [System.Text.UTF8Encoding]::new($false))
  Write-Output "Exportados $rowNumber registros en $Destination"
}
finally {
  if ($reader) { $reader.Close() }
  $connection.Close()
}
